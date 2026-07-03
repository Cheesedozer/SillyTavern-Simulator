// First-party QA fixture extension: registers a single function-calling tool so the harness
// can verify the mock LLM's scripted tool_calls actually reach a real registered extension tool,
// without depending on the behavior of whatever third-party extension is under test that week.
(function () {
    const context = SillyTavern.getContext();
    window.__toolEchoCalls = [];

    context.registerFunctionTool({
        name: 'tool_echo',
        displayName: 'Tool Echo',
        description: 'A QA fixture tool that echoes back whatever message it is called with.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Message to echo back.' },
            },
            required: ['message'],
        },
        action: async (args) => {
            window.__toolEchoCalls.push(args);
            console.log('[tool-echo] invoked with', JSON.stringify(args));
            return `Echoed: ${args.message}`;
        },
    });
})();
