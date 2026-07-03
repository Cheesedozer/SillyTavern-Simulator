import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Renders a run's results into report.md. Deliberately quotes captured log text verbatim rather
 * than summarizing "no errors found" from vibes -- that grounding is the entire point of running
 * a real instance instead of asking a human to remember what they saw.
 */
export async function writeReport(runDir, { extensionUrl, steps, session }) {
  const lines = [];
  lines.push('# SillyTavern Extension Test Report');
  lines.push('');
  lines.push(`- **Extension URL:** ${extensionUrl ?? '(none -- no extension installed this run)'}`);
  lines.push(`- **Run directory:** \`${runDir}\``);
  lines.push(`- **Generated:** ${new Date().toISOString()}`);
  lines.push('');

  lines.push('## Steps');
  lines.push('');
  for (const step of steps) {
    const mark = step.ok === false ? '❌' : '✅';
    lines.push(`${mark} **${step.label}**${step.detail ? ` -- ${step.detail}` : ''}`);
    if (step.screenshot) {
      lines.push(`   ![${step.label}](${step.screenshot})`);
    }
  }
  lines.push('');

  const consoleErrors = session?.consoleErrors ?? [];
  lines.push(`## Console errors (${consoleErrors.length})`);
  lines.push('');
  if (consoleErrors.length === 0) {
    lines.push('None captured.');
  } else {
    for (const err of consoleErrors) {
      lines.push(`- \`${err.text}\``);
    }
  }
  lines.push('');

  const pageErrors = session?.pageErrors ?? [];
  lines.push(`## Uncaught page errors (${pageErrors.length})`);
  lines.push('');
  if (pageErrors.length === 0) {
    lines.push('None captured.');
  } else {
    for (const err of pageErrors) {
      lines.push(`- \`${err}\``);
    }
  }
  lines.push('');

  const mockWarnings = await readMockWarnings(runDir);
  lines.push(`## Mock LLM warnings (${mockWarnings.length})`);
  lines.push('');
  if (mockWarnings.length === 0) {
    lines.push('None -- every request the extension triggered matched a scripted scenario entry.');
  } else {
    lines.push('These indicate the scenario file didn\'t cover something the extension actually did:');
    lines.push('');
    for (const warning of mockWarnings) {
      lines.push(`- \`${warning}\``);
    }
  }
  lines.push('');

  const reportPath = path.join(runDir, 'report.md');
  await fsp.writeFile(reportPath, lines.join('\n'));
  return reportPath;
}

async function readMockWarnings(runDir) {
  try {
    const content = await fsp.readFile(path.join(runDir, 'mock-llm.log'), 'utf8');
    return content.split('\n').filter((line) => line.includes('WARNING: unscripted request'));
  } catch {
    return [];
  }
}
