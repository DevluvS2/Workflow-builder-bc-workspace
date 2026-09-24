/* Batch 7D: persistent PHP background jobs with polling, refresh reconnect, and cancellation. */
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
            error.httpStatus = response.status;
            throw error;
        }
        return data;
    }

    createRun(workflow, execution = {mode: 'workflow'}) {
        return this.request('/api/runs', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({apiVersion: 1, workflow, execution})
        });
    }

    getRun(jobId) {
        return this.request(`/api/runs/${encodeURIComponent(jobId)}`);
    }

    cancelRun(jobId) {
        return this.request(`/api/runs/${encodeURIComponent(jobId)}/cancel`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({apiVersion: 1})
        });
    }

    executeWorkflow(workflow, execution = {mode: 'workflow'}) {
        return this.request('/api/execute', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({apiVersion: 1, workflow, execution})
        });
    }

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
