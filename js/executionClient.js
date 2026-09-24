/* Batch 7B: controlled synchronous PHP execution; scripts are not supported yet. */
class ExecutionClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    async request(path, options = {}) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            credentials: 'same-origin',
            cache: 'no-store',
            ...options
        });
        const data = await response.json();
        if (!response.ok) {
            const message = Array.isArray(data.errors) ? data.errors.join(' ') : data.message || `HTTP ${response.status}`;
            throw new Error(message);
        }
        return data;
    }

    executeControlled(workflow, execution = {mode: 'workflow'}) {
        return this.request('/api/execute', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({apiVersion: 1, workflow, execution})
        });
    }

    health() {
        return this.request('/api/health');
    }

    validateWorkflow(workflow) {
        return this.request('/api/validate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({apiVersion: 1, workflow})
        });
    }
}
// Dev console: await executionClient.health();
// Dev console: await executionClient.validateWorkflow(board.getWorkflowData());
const executionClient = new ExecutionClient();
