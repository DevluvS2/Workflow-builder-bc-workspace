/* Batch 7C: synchronous PHP workflow execution with local Python/Bash/Node child processes. */
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
            let message = Array.isArray(data.errors)
                ? data.errors.join(' ')
                : data.message || `HTTP ${response.status}`;
            if (data.stderr && typeof data.stderr === 'string') {
                const first = data.stderr.trim().split(/\r?\n/)[0];
                if (first && !message.includes(first)) message += ` ${first}`;
            }
            const error = new Error(message);
            error.code = data.code || null;
            error.details = data;
            throw error;
        }
        return data;
    }

    executeWorkflow(workflow, execution = {mode: 'workflow'}) {
        return this.request('/api/execute', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({apiVersion: 1, workflow, execution})
        });
    }

    // Backward-compatible alias for any Batch 7B callers.
    executeControlled(workflow, execution = {mode: 'workflow'}) {
        return this.executeWorkflow(workflow, execution);
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

const executionClient = new ExecutionClient();
