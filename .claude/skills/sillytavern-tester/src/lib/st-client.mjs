import { chromium } from 'playwright';

const CHROMIUM_PATH = '/opt/pw-browsers/chromium';

/**
 * Thin Playwright wrapper around a real, live SillyTavern browser session. Every selector here
 * was verified by hand against a real running instance (release branch) -- see the project's
 * plan notes. SillyTavern has no clean out-of-band API for "send a message, get a reply", so
 * driving the actual UI is the only realistic way to exercise it end to end.
 */
export class SillyTavernSession {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.consoleLogs = [];
    this.pageErrors = [];
    this.networkLog = [];
  }

  async launch() {
    this.browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
    this.page = await this.browser.newPage();
    this.page.on('console', (msg) => {
      this.consoleLogs.push({ type: msg.type(), text: msg.text() });
    });
    this.page.on('pageerror', (err) => {
      this.pageErrors.push(err.message);
    });
    this.page.on('requestfinished', async (req) => {
      const res = await req.response();
      this.networkLog.push({ url: req.url(), method: req.method(), status: res?.status() });
    });
    this.page.on('requestfailed', (req) => {
      this.networkLog.push({ url: req.url(), method: req.method(), status: 'FAILED', error: req.failure()?.errorText });
    });
    await this.page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await this.page.waitForTimeout(500);
  }

  /** Handles the first-run "Welcome to SillyTavern!" persona modal, if it's showing. */
  async dismissOnboardingIfPresent(personaName) {
    const input = this.page.locator('dialog.popup textarea.popup-input');
    if (await input.count() === 0) return false;
    const visible = await input.first().isVisible().catch(() => false);
    if (!visible) return false;
    await input.first().fill(personaName);
    await this.page.click('dialog.popup .popup-button-ok');
    await this.page.waitForTimeout(500);
    return true;
  }

  /**
   * Clicks "Connect" on the API Connections panel. SillyTavern only reads the persisted
   * chat_completion_source/custom_url from settings.json at boot but still requires an explicit
   * client-side Connect click every session before it will actually generate -- this is not
   * something that can be pre-baked into settings.json.
   */
  async ensureApiConnected() {
    await this.ensureDrawerOpen('#API-status-top');
    await this.page.click('#api_button_openai');
    await this.page.waitForTimeout(1000);
    // Scoped to #openai_api: the same "online_status_text" class/text also exists, hidden, for
    // every other (inactive) API type's panel, so an unscoped text search matches the wrong one.
    const statusText = await this.page.locator('#openai_api .online_status_text').innerText().catch(() => '');
    if (statusText.trim() !== 'Valid') {
      throw new Error(`API did not report a valid connection after clicking Connect (status: "${statusText.trim()}")`);
    }
  }

  /**
   * SillyTavern's top-bar icons each toggle a sibling `.drawer-content` open/closed; clicking an
   * already-open one closes it again. This checks state first so repeated calls are idempotent,
   * since a naive blind click breaks the moment two driver methods touch the same drawer.
   */
  async ensureDrawerOpen(iconSelector) {
    const isClosed = await this.page.evaluate((sel) => {
      const icon = document.querySelector(sel);
      const drawer = icon?.closest('.drawer');
      const content = drawer?.querySelector('.drawer-content');
      return content ? content.classList.contains('closedDrawer') : true;
    }, iconSelector);
    if (!isClosed) return;
    await this.page.click(iconSelector);
    await this.page.waitForTimeout(300);
  }

  /** Creates a character via the real "Create New Character" form, or reuses one with the same name. */
  async createCharacter({ name, description, firstMessage }) {
    await this.ensureDrawerOpen('#rightNavDrawerIcon');
    const existing = this.page.locator(`.character_select:has-text("${name}")`);
    if (await existing.count() > 0) return;

    await this.page.click('#rm_button_create');
    await this.page.waitForTimeout(300);
    await this.page.fill('#character_name_pole', name);
    await this.page.fill('#description_textarea', description ?? '');
    await this.page.fill('#firstmessage_textarea', firstMessage ?? '');
    await this.page.click('#create_button_label');
    await this.page.waitForTimeout(1000);
  }

  async selectCharacter(name) {
    await this.ensureDrawerOpen('#rightNavDrawerIcon');
    await this.page.click(`.character_select:has-text("${name}")`);
    await this.page.waitForTimeout(800);
  }

  /** Sends a chat message (or an STscript slash command, e.g. "/roll 1d6") through the real chat box. */
  async sendMessage(text) {
    const before = await this.page.locator('.mes').count();
    await this.page.fill('#send_textarea', text);
    await this.page.locator('#send_textarea').press('Enter');
    await this.page.waitForFunction(
      (n) => document.querySelectorAll('.mes').length > n,
      before,
      { timeout: 15_000 },
    ).catch(() => {
      // No new message rendered (e.g. a slash command with no chat output) -- not necessarily an error.
    });
    await this.page.waitForTimeout(500);
  }

  async getAllMessageTexts() {
    return this.page.locator('.mes .mes_text').allInnerTexts();
  }

  async getLastMessageText() {
    const texts = await this.getAllMessageTexts();
    return texts.at(-1) ?? '';
  }

  /**
   * Installs a third-party extension from a git URL through the real install flow (the same one
   * a human uses): Extensions panel -> "Install extension" -> paste URL -> confirm the built-in
   * security warning. Returns { installed: true } on success, or throws with SillyTavern's own
   * error text if the install endpoint rejects it.
   */
  async installExtension(gitUrl) {
    const logsBefore = this.consoleLogs.length;

    await this.ensureDrawerOpen('#extensions-settings-button');
    await this.page.click('#third_party_extension_button');
    await this.page.waitForTimeout(300);
    await this.page.fill('dialog.popup textarea.popup-input', gitUrl);
    await this.page.click('dialog.popup .popup-button-ok');
    await this.page.waitForTimeout(500);

    const confirmBtn = this.page.getByText('Yes, install it', { exact: true });
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
    }
    await this.page.waitForTimeout(4000);

    // Toasts auto-dismiss, so checking DOM state after the fact is unreliable -- the accumulated
    // console log (captured continuously since launch()) is the durable record of what happened.
    const newErrors = this.consoleLogs.slice(logsBefore).filter((entry) => entry.type === 'error');
    const installError = newErrors.find((entry) => /install/i.test(entry.text));
    if (installError) {
      throw new Error(`Extension install failed: ${installError.text}`);
    }
    return { installed: true };
  }

  async screenshot(filePath) {
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  get consoleErrors() {
    return this.consoleLogs.filter((entry) => entry.type === 'error');
  }

  async close() {
    await this.browser?.close();
  }
}
