# PHP Batch 7A — API foundation (development only)

**Install only the new/edited files from the ZIP into the project root.** Keep all existing files from Batch 6. `index.html` is edited solely to load `js/executionClient.js` before `js/app.js`.

## Runtime

1. Install PHP 8.1+ if `php -v` fails. PHP needs to be on PATH. No Composer, database, Docker, Python, Bash or Node service is needed for Batch 7A.
2. Stop VS Code Live Server for this project. In VS Code terminal, from project root, run `php -S 127.0.0.1:8000 dev-router.php`.
3. Open **http://127.0.0.1:8000** (not a `file://` URL or Live Server port).
4. Open **http://127.0.0.1:8000/api/health**. Expect `executionEnabled:false`.
5. In browser DevTools Console run `await executionClient.health()` and `await executionClient.validateWorkflow(board.getWorkflowData())`. Expect `status:"validated_only"`. These are manual diagnostic calls; clicking Run still invokes the existing local simulator in 7A.
6. In a second terminal run `php tests/api-smoke.php`. Verify all four PASS lines.
7. In PowerShell, verify backend source is not accessible: `curl.exe -i http://127.0.0.1:8000/backend/src/WorkflowValidator.php` → 404.
8. Regression: create/connect widgets, import/export, run, undo/redo, refresh. Existing execution behavior must remain unchanged in 7A.

## Precise scope / security

- `/api/health` GET; `/api/validate` POST validates graph and ports, maximum 1 MiB JSON. `/api/runs` returns HTTP 501; no execution or job is created, and no dynamic scripts are evaluated by PHP.
- The PHP built-in server is development-only. Router serves only known frontend assets; `backend/src/` is inaccessible from HTTP through this router.
- This is **schema preflight**, not exhaustive validation. No authentication, job persistence, CSRF controls, secure runners, script sandbox, production web-server config, deployment, or server execution yet. Never expose publicly.
- Do not assume the frontend has moved processing to PHP yet. Language execution, resource limits, authentication, job isolation, and authoritative dependency handling must precede any public deployment.
- Deployment and multi-user requirements remain undecided. Use loopback `127.0.0.1` only until requirements are fixed.

## Commit

```powershell
git status
git add index.html js/executionClient.js dev-router.php backend/public/index.php backend/src/WorkflowValidator.php tests/api-smoke.php README_BATCH7A.md
git commit -m "Scaffold PHP API and workflow validation client"
git push
```
