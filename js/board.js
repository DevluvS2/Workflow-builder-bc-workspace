class Board {
    constructor(rootElement) {
        this.rootElement = rootElement;

        this.widgets = [];
        this.selectedWidget = null;
        this.selectedConnection = null;

        this.nextWidgetZIndex = 3;

        this.hoverPeekWidget = null;
        this.pinnedPeekWidget = null;

        this.peekOutlineElements = [];

        this.hoverPeekConnections = [];

        this.connections = [];
        this.nextConnectionNumber = 1;

        this.connectionSourceWidget = null;
        this.connectionSourcePortId = null;
        this.connectionPreviewElement = null;

        this.connectionMoveHandler = null;
        this.connectionEndHandler = null;
        this.connectionCancelHandler = null;

        this.contextMenu = null;

        /* Custom in-app dialog state. */
        this.activeDialog = null;
        this.activeDataInspector = null;

        /* Guided interface tutorial. */
        this.tutorialStorageKey =
            "workflowBuilderInterfaceTutorialSeenV3";
        this.tutorialActive = false;
        this.tutorialStepIndex = 0;
        this.tutorialSteps = [];
        this.tutorialLayer = null;
        this.tutorialHighlight = null;
        this.tutorialCard = null;
        this.tutorialResizeHandler = null;
        this.tutorialPreviousUiState = null;
        this.tutorialSectionId = "full";
        this.tutorialSectionLabel = "Full Tutorial";

        /*
         * Progressive-disclosure state for the Properties panel.
         * These are UI preferences only; workflow data remains unchanged.
         */
        this.propertyGroupState = {
            basic: false,
            io: false,
            execution: true,
            advanced: true
        };

        this.leftPanelVisible = true;
        this.rightPanelVisible = true;

        this.leftPanelWidth = 220;
        this.rightPanelWidth = 320;
        
        this.workspaceWidth = 6000;
        this.workspaceHeight = 4000;

        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        
        this.isPanning = false;

        this.panStartX = 0;
        this.panStartY = 0;

        this.panStartOffsetX = 0;
        this.panStartOffsetY = 0;

        /*
         * Workflow Map dragging state.
         */
        this.isWorkflowMapDragging = false;
        this.workflowMapPointerId = null;
        this.workflowMapDragOffsetX = 0;
        this.workflowMapDragOffsetY = 0;

        this.minimumZoom = 0.25;
        this.maximumZoom = 4;
        this.zoomStep = 0.1;

        this.nextWidgetNumber = 1;

        this.storageKey =
            "workflowBuilderCurrentWorkflow";

        this.saveTimer = null;

        /*
         * Undo / Redo history.
         *
         * We store snapshots of editable workflow content
         * (widgets + connections), not camera/panel state.
         */
        this.undoStack = [];
        this.redoStack = [];
        this.historyLimit = 100;
        this.isApplyingHistory = false;

        /*
         * Workflow execution / validation state.
         */
        this.isWorkflowRunning = false;
        this.isWorkflowPaused = false;
        this.workflowPauseResolvers = [];
        this.currentExecutionMode = "idle";
        this.currentExecutionWidgetIds = new Set();
        this.currentExecutionLabel = "";
        this.currentRunningWidget = null;
        this.executionRunId = 0;
        this.lastRunRuntimeMs = 0;
        this.lastRunMemoryKb = 0;
        this.lastValidationReport = {
            valid: true,
            errors: [],
            warnings: []
        };

        /*
         * Runtime branch-state map.
         *
         * Every connection is marked active/inactive as its source node
         * executes. Decision widgets activate only the selected output
         * branch; skipped nodes propagate inactivity downstream.
         */
        this.branchConnectionStates =
            new Map();
        this.hasBranchExecutionState = false;

        /*
         * Bottom execution console.
         *
         * Logs are intentionally session-only. They describe what happened
         * during the current browser session and are not saved into workflow JSON.
         */
        this.executionConsoleOpen = false;
        this.executionConsoleHeight = 210;
        this.executionConsoleMinHeight = 120;
        this.executionConsoleMaxHeight = 420;
        this.executionConsoleAutoScroll = true;
        this.executionConsoleStatus = "idle";
        this.executionLogEntries = [];
        this.executionLogLimit = 500;

        document.addEventListener("keydown", (event) => {
            this.handleKeyDown(event);
        });

        document.addEventListener(
            "pointerdown",
            (event) => {
                if (
                    this.contextMenu &&
                    !this.contextMenu.contains(event.target)
                ) {
                    this.hideContextMenu();
                }
            }
        );

        this.render();

        window.setTimeout(
            () => this.maybeStartFirstRunTutorial(),
            500
        );
    }

    render() {
        this.rootElement.innerHTML = "";

        const boardElement = document.createElement("div");
        boardElement.className = "board";

        const menuBar = this.createMenuBar();
        const mainArea = this.createMainArea();
        const executionConsole =
            this.createExecutionConsole();
        const statsBar = this.createStatsBar();

        boardElement.appendChild(menuBar);
        boardElement.appendChild(mainArea);
        boardElement.appendChild(executionConsole);
        boardElement.appendChild(statsBar);

        this.rootElement.appendChild(boardElement);

        this.boardElement = boardElement;

        this.updateWorkspaceTransform();
        this.updateStats();
        this.updateWorkflowMap();
    }

    createMenuBar() {
        const menuBar = document.createElement("header");
        menuBar.className = "menu-bar";

        /* =============================
         * File
         * ============================= */
        const fileMenu = document.createElement("div");
        fileMenu.className = "dropdown-menu";
        fileMenu.dataset.tour = "file-menu";

        const fileButton = document.createElement("button");
        fileButton.className = "dropdown-button";
        fileButton.textContent = "File";

        const fileDropdown = document.createElement("div");
        fileDropdown.className = "dropdown-content";

        const newMenuItem = document.createElement("button");
        newMenuItem.textContent = "New";
        newMenuItem.addEventListener("click", () => {
            this.createNewWorkflow();
        });

        const exportMenuItem = document.createElement("button");
        exportMenuItem.textContent = "Export";
        exportMenuItem.title = "Export workflow JSON (Ctrl+S)";
        exportMenuItem.addEventListener("click", () => {
            this.exportWorkflow();
        });

        const importMenuItem = document.createElement("button");
        importMenuItem.textContent = "Import";

        fileDropdown.appendChild(newMenuItem);
        fileDropdown.appendChild(exportMenuItem);
        fileDropdown.appendChild(importMenuItem);
        fileMenu.appendChild(fileButton);
        fileMenu.appendChild(fileDropdown);

        const importInput = document.createElement("input");
        importInput.type = "file";
        importInput.accept = ".json,application/json";
        importInput.hidden = true;

        importMenuItem.addEventListener("click", () => {
            importInput.click();
        });

        importInput.addEventListener("change", (event) => {
            const selectedFile = event.target.files[0];

            if (selectedFile) {
                this.importWorkflow(selectedFile);
            }

            event.target.value = "";
        });

        fileMenu.appendChild(importInput);


        /* =============================
         * Edit
         * ============================= */
        const editMenu = document.createElement("div");
        editMenu.className = "dropdown-menu";
        editMenu.dataset.tour = "edit-menu";

        const editButton = document.createElement("button");
        editButton.className = "dropdown-button";
        editButton.textContent = "Edit";

        const editDropdown = document.createElement("div");
        editDropdown.className = "dropdown-content";

        const undoMenuItem = document.createElement("button");
        undoMenuItem.textContent = "Undo   Ctrl+Z";
        undoMenuItem.addEventListener("click", () => this.undo());

        const redoMenuItem = document.createElement("button");
        redoMenuItem.textContent = "Redo   Ctrl+Y";
        redoMenuItem.addEventListener("click", () => this.redo());

        const duplicateMenuItem = document.createElement("button");
        duplicateMenuItem.textContent = "Duplicate Selected   Ctrl+D";
        duplicateMenuItem.addEventListener("click", () => {
            if (this.selectedWidget) {
                this.duplicateWidget(this.selectedWidget);
            }
        });

        const editDivider = document.createElement("div");
        editDivider.className = "dropdown-divider";

        editDropdown.appendChild(undoMenuItem);
        editDropdown.appendChild(redoMenuItem);
        editDropdown.appendChild(editDivider);
        editDropdown.appendChild(duplicateMenuItem);
        editMenu.appendChild(editButton);
        editMenu.appendChild(editDropdown);


        /* =============================
         * View
         * ============================= */
        const viewMenu = document.createElement("div");
        viewMenu.className = "dropdown-menu";
        viewMenu.dataset.tour = "view-menu";

        const viewButton = document.createElement("button");
        viewButton.className = "dropdown-button";
        viewButton.textContent = "View";

        const viewDropdown = document.createElement("div");
        viewDropdown.className =
            "dropdown-content view-dropdown-content";

        const leftPanelOption = document.createElement("label");
        leftPanelOption.className = "dropdown-check-item";

        const leftPanelCheckbox = document.createElement("input");
        leftPanelCheckbox.type = "checkbox";
        leftPanelCheckbox.checked = this.leftPanelVisible;
        leftPanelCheckbox.setAttribute("aria-label", "Show left panel");

        const leftPanelText = document.createElement("span");
        leftPanelText.textContent = "Left Panel";

        leftPanelOption.appendChild(leftPanelCheckbox);
        leftPanelOption.appendChild(leftPanelText);

        const rightPanelOption = document.createElement("label");
        rightPanelOption.className = "dropdown-check-item";

        const rightPanelCheckbox = document.createElement("input");
        rightPanelCheckbox.type = "checkbox";
        rightPanelCheckbox.checked = this.rightPanelVisible;
        rightPanelCheckbox.setAttribute("aria-label", "Show right panel");

        const rightPanelText = document.createElement("span");
        rightPanelText.textContent = "Right Panel";

        rightPanelOption.appendChild(rightPanelCheckbox);
        rightPanelOption.appendChild(rightPanelText);

        this.leftPanelViewCheckbox = leftPanelCheckbox;
        this.rightPanelViewCheckbox = rightPanelCheckbox;

        leftPanelCheckbox.addEventListener("change", () => {
            if (leftPanelCheckbox.checked !== this.leftPanelVisible) {
                this.togglePanel("left");
            }
        });

        rightPanelCheckbox.addEventListener("change", () => {
            if (rightPanelCheckbox.checked !== this.rightPanelVisible) {
                this.togglePanel("right");
            }
        });

        const executionConsoleOption =
            document.createElement("label");
        executionConsoleOption.className =
            "dropdown-check-item";

        const executionConsoleCheckbox =
            document.createElement("input");
        executionConsoleCheckbox.type = "checkbox";
        executionConsoleCheckbox.checked =
            this.executionConsoleOpen;
        executionConsoleCheckbox.setAttribute(
            "aria-label",
            "Show execution console"
        );

        const executionConsoleText =
            document.createElement("span");
        executionConsoleText.textContent =
            "Execution Console";

        executionConsoleOption.appendChild(
            executionConsoleCheckbox
        );
        executionConsoleOption.appendChild(
            executionConsoleText
        );

        this.executionConsoleViewCheckbox =
            executionConsoleCheckbox;

        executionConsoleCheckbox.addEventListener(
            "change",
            () => {
                this.setExecutionConsoleOpen(
                    executionConsoleCheckbox.checked
                );
            }
        );

        const viewDivider = document.createElement("div");
        viewDivider.className = "dropdown-divider";

        const resetViewMenuItem = document.createElement("button");
        resetViewMenuItem.className = "reset-view-menu-item";
        resetViewMenuItem.textContent = "Reset View";
        resetViewMenuItem.addEventListener("click", () => {
            this.resetView();
        });

        viewDropdown.appendChild(leftPanelOption);
        viewDropdown.appendChild(rightPanelOption);
        viewDropdown.appendChild(
            executionConsoleOption
        );
        viewDropdown.appendChild(viewDivider);
        viewDropdown.appendChild(resetViewMenuItem);
        viewMenu.appendChild(viewButton);
        viewMenu.appendChild(viewDropdown);


        /* =============================
         * Workflow
         * ============================= */
        const workflowMenu = document.createElement("div");
        workflowMenu.className = "dropdown-menu";
        workflowMenu.dataset.tour = "workflow-menu";

        const workflowButton = document.createElement("button");
        workflowButton.className = "dropdown-button";
        workflowButton.textContent = "Workflow";

        const workflowDropdown = document.createElement("div");
        workflowDropdown.className = "dropdown-content workflow-dropdown-content";

        const createWorkflowCommandItem = ({
            label,
            shortcut = "",
            icon,
            iconFill = false
        }) => {
            const button = document.createElement("button");
            button.className = "workflow-command-item";
            button.type = "button";

            button.innerHTML = `
                <span class="workflow-menu-icon${iconFill ? " fill-icon" : ""}" aria-hidden="true">
                    ${icon}
                </span>
                <span class="workflow-menu-label">${label}</span>
                <span class="workflow-menu-shortcut">${shortcut}</span>
            `;

            return button;
        };

        const runMenuItem = createWorkflowCommandItem({
            label: "Run Workflow",
            shortcut: "Ctrl+Enter",
            iconFill: true,
            icon: `
                <svg viewBox="0 0 24 24">
                    <path d="M8 5.5L18 12L8 18.5Z"></path>
                </svg>
            `
        });
        runMenuItem.addEventListener("click", () => {
            this.runWorkflow();
        });

        const runSelectedMenuItem = createWorkflowCommandItem({
            label: "Run Selected Node",
            shortcut: "Ctrl+Shift+Enter",
            icon: `
                <svg viewBox="0 0 24 24">
                    <rect x="4" y="5" width="8" height="14" rx="2"></rect>
                    <path d="M14.5 8.5L20 12L14.5 15.5Z"></path>
                </svg>
            `
        });
        runSelectedMenuItem.addEventListener("click", () => {
            this.runSelectedWidget();
        });

        const runFromSelectedMenuItem = createWorkflowCommandItem({
            label: "Run From Selected Node",
            icon: `
                <svg viewBox="0 0 24 24">
                    <circle cx="6" cy="12" r="2.25"></circle>
                    <path d="M8.5 12H18"></path>
                    <path d="M14.5 8.5L18 12L14.5 15.5"></path>
                </svg>
            `
        });
        runFromSelectedMenuItem.addEventListener("click", () => {
            this.runFromSelectedWidget();
        });

        const runDivider = document.createElement("div");
        runDivider.className = "dropdown-divider";

        const pauseMenuItem = createWorkflowCommandItem({
            label: "Pause Run",
            shortcut: "Ctrl+.",
            iconFill: true,
            icon: `
                <svg viewBox="0 0 24 24">
                    <path d="M7 5H10V19H7Z"></path>
                    <path d="M14 5H17V19H14Z"></path>
                </svg>
            `
        });
        pauseMenuItem.addEventListener("click", () => {
            this.toggleWorkflowPause();
        });

        const stopMenuItem = createWorkflowCommandItem({
            label: "Stop Run",
            iconFill: true,
            icon: `
                <svg viewBox="0 0 24 24">
                    <rect x="7" y="7" width="10" height="10" rx="1"></rect>
                </svg>
            `
        });
        stopMenuItem.addEventListener("click", () => {
            this.stopWorkflowRun();
        });

        const workflowDivider = document.createElement("div");
        workflowDivider.className = "dropdown-divider";

        const validateMenuItem = createWorkflowCommandItem({
            label: "Validate Workflow",
            icon: `
                <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8"></circle>
                    <path d="M8.5 12.25L10.75 14.5L15.75 9.5"></path>
                </svg>
            `
        });
        validateMenuItem.addEventListener("click", () => {
            this.validateWorkflow(true);
        });

        const resetStatusMenuItem = createWorkflowCommandItem({
            label: "Reset Status Labels",
            icon: `
                <svg viewBox="0 0 24 24">
                    <path d="M19 8A8 8 0 1 0 20 14"></path>
                    <path d="M19 4V8H15"></path>
                </svg>
            `
        });
        resetStatusMenuItem.addEventListener("click", () => {
            this.resetWorkflowStatuses();
        });

        workflowDropdown.appendChild(runMenuItem);
        workflowDropdown.appendChild(runSelectedMenuItem);
        workflowDropdown.appendChild(runFromSelectedMenuItem);
        workflowDropdown.appendChild(runDivider);
        workflowDropdown.appendChild(pauseMenuItem);
        workflowDropdown.appendChild(stopMenuItem);
        workflowDropdown.appendChild(workflowDivider);
        workflowDropdown.appendChild(validateMenuItem);
        workflowDropdown.appendChild(resetStatusMenuItem);
        workflowMenu.appendChild(workflowButton);
        workflowMenu.appendChild(workflowDropdown);

        this.runWorkflowMenuItem = runMenuItem;
        this.runSelectedMenuItem = runSelectedMenuItem;
        this.runFromSelectedMenuItem = runFromSelectedMenuItem;
        this.pauseWorkflowMenuItem = pauseMenuItem;
        this.stopWorkflowMenuItem = stopMenuItem;


        /* =============================
         * Help
         * ============================= */
        const helpMenu = document.createElement("div");
        helpMenu.className = "dropdown-menu";
        helpMenu.dataset.tour = "help-menu";

        const helpButton = document.createElement("button");
        helpButton.className = "dropdown-button";
        helpButton.textContent = "Help";
        helpButton.title = "Open a guided tutorial";

        const helpDropdown = document.createElement("div");
        helpDropdown.className =
            "dropdown-content help-dropdown-content";

        const tutorialSections = [
            ["full", "Full Tutorial"],
            ["basics", "Interface Basics"],
            ["canvas", "Canvas & Navigation"],
            ["widgets", "Widgets & Connections"],
            ["io", "Inputs & Outputs"],
            ["debug", "Data & Debugging"],
            ["properties", "Properties Panel"],
            ["scripts", "Scripts & Languages"],
            ["decisions", "Decision Nodes"],
            ["run", "Run Controls & Validation"],
            ["console", "Execution Console"],
            ["shortcuts", "Keyboard Shortcuts"]
        ];

        tutorialSections.forEach(
            ([sectionId, label], index) => {
                if (index === 1) {
                    const divider =
                        document.createElement("div");
                    divider.className = "dropdown-divider";
                    helpDropdown.appendChild(divider);
                }

                const item =
                    document.createElement("button");
                item.type = "button";
                item.className = "tutorial-section-item";
                item.textContent = label;
                item.addEventListener("click", () => {
                    this.startInterfaceTutorial({
                        force: true,
                        section: sectionId
                    });
                });

                helpDropdown.appendChild(item);
            }
        );

        helpMenu.appendChild(helpButton);
        helpMenu.appendChild(helpDropdown);


        /* =============================
         * Undo / Redo icon toolbar
         * ============================= */
        const historyControls = document.createElement("div");
        historyControls.className = "history-controls";
        historyControls.dataset.tour = "history-controls";

        const undoButton = document.createElement("button");
        undoButton.className = "history-icon-button";
        undoButton.type = "button";
        undoButton.title = "Undo (Ctrl+Z)";
        undoButton.setAttribute("aria-label", "Undo");
        undoButton.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 7H16.25C19.43 7 22 9.57 22 12.75C22 15.93 19.43 18.5 16.25 18.5H13"></path>
                <path d="M9 7L12.5 3.5"></path>
                <path d="M9 7L12.5 10.5"></path>
            </svg>
        `;

        const redoButton = document.createElement("button");
        redoButton.className = "history-icon-button";
        redoButton.type = "button";
        redoButton.title = "Redo (Ctrl+Y / Ctrl+Shift+Z)";
        redoButton.setAttribute("aria-label", "Redo");
        redoButton.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 7H7.75C4.57 7 2 9.57 2 12.75C2 15.93 4.57 18.5 7.75 18.5H11"></path>
                <path d="M15 7L11.5 3.5"></path>
                <path d="M15 7L11.5 10.5"></path>
            </svg>
        `;

        undoButton.addEventListener("click", () => this.undo());
        redoButton.addEventListener("click", () => this.redo());

        historyControls.appendChild(undoButton);
        historyControls.appendChild(redoButton);

        this.undoButton = undoButton;
        this.redoButton = redoButton;

        /* =============================
         * Workflow run icon toolbar
         * ============================= */
        const runControls = document.createElement("div");
        runControls.className = "run-controls";
        runControls.dataset.tour = "run-controls";

        const runToolbarButton = document.createElement("button");
        runToolbarButton.className = "history-icon-button run-toolbar-button";
        runToolbarButton.type = "button";
        runToolbarButton.title = "Run Workflow (Ctrl+Enter)";
        runToolbarButton.setAttribute("aria-label", "Run Workflow");
        runToolbarButton.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path class="run-icon-fill" d="M8 5.5L18 12L8 18.5Z"></path>
            </svg>
        `;
        runToolbarButton.addEventListener("click", () => {
            this.runWorkflow();
        });

        const pauseToolbarButton = document.createElement("button");
        pauseToolbarButton.className = "history-icon-button run-toolbar-button";
        pauseToolbarButton.type = "button";
        pauseToolbarButton.title = "Pause Run";
        pauseToolbarButton.setAttribute("aria-label", "Pause Run");
        pauseToolbarButton.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path class="run-icon-fill" d="M7 5H10V19H7Z"></path>
                <path class="run-icon-fill" d="M14 5H17V19H14Z"></path>
            </svg>
        `;
        pauseToolbarButton.addEventListener("click", () => {
            this.toggleWorkflowPause();
        });

        const stopToolbarButton = document.createElement("button");
        stopToolbarButton.className = "history-icon-button run-toolbar-button stop-run-toolbar-button";
        stopToolbarButton.type = "button";
        stopToolbarButton.title = "Stop Run";
        stopToolbarButton.setAttribute("aria-label", "Stop Run");
        stopToolbarButton.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect class="run-icon-fill" x="7" y="7" width="10" height="10" rx="1"></rect>
            </svg>
        `;
        stopToolbarButton.addEventListener("click", () => {
            this.stopWorkflowRun();
        });

        runControls.appendChild(runToolbarButton);
        runControls.appendChild(pauseToolbarButton);
        runControls.appendChild(stopToolbarButton);

        this.runToolbarButton = runToolbarButton;
        this.pauseToolbarButton = pauseToolbarButton;
        this.stopToolbarButton = stopToolbarButton;

        /* =============================
         * Execution Console toolbar button
         * ============================= */
        const consoleButton =
            document.createElement("button");
        consoleButton.className =
            "history-icon-button console-toolbar-button";
        consoleButton.dataset.tour = "console-button";
        consoleButton.type = "button";
        consoleButton.title =
            "Toggle Execution Console (Ctrl+`)";
        consoleButton.setAttribute(
            "aria-label",
            "Toggle Execution Console"
        );
        consoleButton.setAttribute(
            "aria-pressed",
            String(this.executionConsoleOpen)
        );
        consoleButton.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2"></rect>
                <path d="M7 9L10 12L7 15"></path>
                <path d="M13 15H17"></path>
            </svg>
        `;
        consoleButton.addEventListener(
            "click",
            () => {
                this.toggleExecutionConsole();
            }
        );
        this.executionConsoleToolbarButton =
            consoleButton;

        const spacer = document.createElement("div");
        spacer.className = "menu-spacer";

        const zoomDisplay = document.createElement("span");
        zoomDisplay.className = "zoom-display";
        zoomDisplay.textContent = "Zoom: 100%";
        this.zoomDisplay = zoomDisplay;

        menuBar.appendChild(fileMenu);
        menuBar.appendChild(editMenu);
        menuBar.appendChild(viewMenu);
        menuBar.appendChild(workflowMenu);
        menuBar.appendChild(helpMenu);
        menuBar.appendChild(historyControls);
        menuBar.appendChild(runControls);
        menuBar.appendChild(consoleButton);
        menuBar.appendChild(spacer);
        menuBar.appendChild(zoomDisplay);

        this.updateHistoryButtons();
        this.updateRunControls();

        return menuBar;
    }

    createMainArea() {
        const mainArea = document.createElement("main");
        mainArea.className = "main-area";

        this.mainArea = mainArea;

        this.leftPanel = this.createPanel(
            "left",
            "Widget Library"
        );

        this.leftResizer =
            this.createPanelResizer("left");

        this.workspaceContainer = this.createWorkspace();

        this.rightPanel = this.createPanel(
            "right",
            "Properties"
        );

        this.rightResizer =
            this.createPanelResizer("right");

        mainArea.appendChild(this.leftPanel);
        mainArea.appendChild(this.leftResizer);
        mainArea.appendChild(this.workspaceContainer);
        mainArea.appendChild(this.rightResizer);
        mainArea.appendChild(this.rightPanel);

        const leftShowZone = this.createPanelShowZone("left");
        const rightShowZone = this.createPanelShowZone("right");

        mainArea.appendChild(leftShowZone);
        mainArea.appendChild(rightShowZone);

        this.leftShowZone = leftShowZone;
        this.rightShowZone = rightShowZone;

        this.applyPanelWidths();

        return mainArea;
    }

    createPanel(side, title) {
        const panel = document.createElement("aside");
        panel.className = `side-panel ${side}-panel`;
        panel.dataset.tour =
            side === "left" ? "left-panel" : "right-panel";

        const panelHeader = document.createElement("div");
        panelHeader.className = "panel-header";

        const panelTitle = document.createElement("span");
        panelTitle.textContent = title;

        const hideButton = document.createElement("button");
        hideButton.textContent = "Hide";

        hideButton.addEventListener("click", () => {
            this.togglePanel(side);
        });

        panelHeader.appendChild(panelTitle);
        panelHeader.appendChild(hideButton);

        const panelContent = document.createElement("div");
        panelContent.className = "panel-content";

        if (side === "left") {
            this.buildWidgetLibrary(panelContent);
        } else {
            this.propertiesPanelContent = panelContent;
            this.showNoSelectionMessage();
        }

        panel.appendChild(panelHeader);
        panel.appendChild(panelContent);

        return panel;
    }

    buildWidgetLibrary(panelContent) {
        const description = document.createElement("p");
        description.className = "panel-description";
        description.textContent =
            "Add workflow widgets to the board.";

        const widgetTypes = [
            "Start",
            "Process",
            "Decision",
            "End"
        ];

        panelContent.appendChild(description);

        widgetTypes.forEach((type) => {
            const button = document.createElement("button");
            button.className = "widget-library-button";
            button.textContent = `Add ${type}`;

            button.addEventListener("click", () => {
                this.createWidget(type);
            });

            panelContent.appendChild(button);
        });
    }

    createWorkspace() {
        const workspaceContainer =
            document.createElement("section");

        workspaceContainer.className = "workspace-container";
        workspaceContainer.dataset.tour = "workspace";

        const workspace = document.createElement("div");
        workspace.className = "workspace";

        workspace.style.width =
            `${this.workspaceWidth}px`;

        workspace.style.height =
            `${this.workspaceHeight}px`;

        const svgNamespace =
            "http://www.w3.org/2000/svg";

        const connectionLayer =
            document.createElementNS(
                svgNamespace,
                "svg"
            );

        connectionLayer.classList.add(
            "connection-layer"
        );

        connectionLayer.setAttribute(
            "width",
            String(this.workspaceWidth)
        );

        connectionLayer.setAttribute(
            "height",
            String(this.workspaceHeight)
        );

        /*
        * SVG definitions let us create reusable
        * graphics such as arrowheads.
        */
        const definitions =
            document.createElementNS(
                svgNamespace,
                "defs"
            );

        const arrowMarker =
            document.createElementNS(
                svgNamespace,
                "marker"
            );

        arrowMarker.setAttribute(
            "id",
            "connection-arrow"
        );

        arrowMarker.setAttribute(
            "viewBox",
            "0 0 10 10"
        );

        arrowMarker.setAttribute(
            "refX",
            "9"
        );

        arrowMarker.setAttribute(
            "refY",
            "5"
        );

        arrowMarker.setAttribute(
            "markerWidth",
            "7"
        );

        arrowMarker.setAttribute(
            "markerHeight",
            "7"
        );

        arrowMarker.setAttribute(
            "orient",
            "auto-start-reverse"
        );

        const arrowPath =
            document.createElementNS(
                svgNamespace,
                "path"
            );

        arrowPath.setAttribute(
            "d",
            "M 0 0 L 10 5 L 0 10 z"
        );

        arrowPath.classList.add(
            "connection-arrow-shape"
        );

        arrowMarker.appendChild(
            arrowPath
        );

        definitions.appendChild(
            arrowMarker
        );

        connectionLayer.appendChild(
            definitions
        );

        workspace.appendChild(
            connectionLayer
        );

        this.connectionLayer =
            connectionLayer;
        
        const workflowMap = this.createWorkflowMap();

        workspaceContainer.appendChild(workspace);
        workspaceContainer.appendChild(workflowMap);

        this.workspace = workspace;

        /*
         * Clicking an empty location clears widget selection.
         */
        workspaceContainer.addEventListener(
            "pointerdown",
            (event) => {
                /*
                * Middle mouse button starts canvas panning.
                *
                * event.button:
                * 0 = left
                * 1 = middle
                * 2 = right
                */
                if (event.button === 1) {
                    this.startPanning(event);
                    return;
                }

                /*
                * Normal left-click on empty canvas clears
                * the selected widget.
                */
                if (
                    event.button === 0 &&
                    (
                        event.target === workspaceContainer ||
                        event.target === workspace
                    )
                ) {
                    this.clearPinnedWidgetPeek();

                    this.selectWidget(null);
                }
            }
        );

        /*
         * Scrolling anywhere in the viewport zooms the workspace.
         */
        workspaceContainer.addEventListener(
            "wheel",
            (event) => {
                this.handleWheel(event);
            },
            {
                passive: false
            }
        );

        workspaceContainer.addEventListener(
            "pointermove",
            (event) => {
                this.panCanvas(event);
            }
        );

        workspaceContainer.addEventListener(
            "pointerup",
            (event) => {
                this.stopPanning(event);
            }
        );

        workspaceContainer.addEventListener(
            "pointercancel",
            (event) => {
                this.stopPanning(event);
            }
        );

        workspaceContainer.addEventListener(
            "auxclick",
            (event) => {
                if (event.button === 1) {
                    event.preventDefault();
                }
            }
        );

        return workspaceContainer;
    }

    createWorkflowMap() {
        const workflowMap =
            document.createElement("div");

        workflowMap.className =
            "workflow-map";
        workflowMap.dataset.tour = "workflow-map";

        const mapTitle =
            document.createElement("div");

        mapTitle.className =
            "workflow-map-title";

        mapTitle.textContent =
            "Workflow Map";

        const mapContent =
            document.createElement("div");

        mapContent.className =
            "workflow-map-content";

        workflowMap.appendChild(
            mapTitle
        );

        workflowMap.appendChild(
            mapContent
        );

        this.workflowMapContent =
            mapContent;

        /*
         * Click anywhere to navigate, or click-and-hold
         * and drag to continuously pan the main canvas.
         */
        mapContent.addEventListener(
            "pointerdown",
            (event) => {
                this.startWorkflowMapDrag(
                    event
                );
            }
        );

        mapContent.addEventListener(
            "pointermove",
            (event) => {
                this.dragWorkflowMap(
                    event
                );
            }
        );

        mapContent.addEventListener(
            "pointerup",
            (event) => {
                this.stopWorkflowMapDrag(
                    event
                );
            }
        );

        mapContent.addEventListener(
            "pointercancel",
            (event) => {
                this.stopWorkflowMapDrag(
                    event
                );
            }
        );

        return workflowMap;
    }

    createExecutionConsole() {
        const panel =
            document.createElement("section");

        panel.className =
            "execution-console";
        panel.dataset.tour =
            "execution-console";

        panel.setAttribute(
            "aria-label",
            "Execution Console"
        );

        const resizeHandle =
            document.createElement("div");

        resizeHandle.className =
            "execution-console-resizer";

        resizeHandle.title =
            "Drag to resize console";

        resizeHandle.addEventListener(
            "pointerdown",
            (event) => {
                this.startExecutionConsoleResize(
                    event
                );
            }
        );

        const header =
            document.createElement("div");

        header.className =
            "execution-console-header";

        const headingGroup =
            document.createElement("div");

        headingGroup.className =
            "execution-console-heading";

        const consoleIcon =
            document.createElement("span");

        consoleIcon.className =
            "execution-console-icon";

        consoleIcon.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 8L10.5 11.5L7 15"></path>
                <path d="M13 15H17"></path>
                <rect x="3" y="4" width="18" height="16" rx="2"></rect>
            </svg>
        `;

        const title =
            document.createElement("strong");

        title.textContent =
            "Execution Console";

        const statusBadge =
            document.createElement("span");

        statusBadge.className =
            "execution-console-status";

        headingGroup.appendChild(
            consoleIcon
        );
        headingGroup.appendChild(title);
        headingGroup.appendChild(
            statusBadge
        );

        const controls =
            document.createElement("div");

        controls.className =
            "execution-console-controls";

        const autoScrollLabel =
            document.createElement("label");

        autoScrollLabel.className =
            "execution-console-autoscroll";

        const autoScrollCheckbox =
            document.createElement("input");

        autoScrollCheckbox.type =
            "checkbox";

        autoScrollCheckbox.checked =
            this.executionConsoleAutoScroll;

        autoScrollCheckbox.addEventListener(
            "change",
            () => {
                this.executionConsoleAutoScroll =
                    autoScrollCheckbox.checked;
            }
        );

        const autoScrollText =
            document.createElement("span");

        autoScrollText.textContent =
            "Auto-scroll";

        autoScrollLabel.appendChild(
            autoScrollCheckbox
        );
        autoScrollLabel.appendChild(
            autoScrollText
        );

        const clearButton =
            document.createElement("button");

        clearButton.type = "button";
        clearButton.className =
            "execution-console-action";
        clearButton.textContent = "Clear";
        clearButton.title =
            "Clear execution log";

        clearButton.addEventListener(
            "click",
            (event) => {
                event.stopPropagation();
                this.clearExecutionConsole();
            }
        );

        const toggleButton =
            document.createElement("button");

        toggleButton.type = "button";
        toggleButton.className =
            "execution-console-toggle";
        toggleButton.title =
            "Expand/collapse execution console";
        toggleButton.setAttribute(
            "aria-label",
            "Expand or collapse execution console"
        );

        toggleButton.addEventListener(
            "click",
            (event) => {
                event.stopPropagation();
                this.toggleExecutionConsole();
            }
        );

        controls.appendChild(
            autoScrollLabel
        );
        controls.appendChild(clearButton);
        controls.appendChild(toggleButton);

        header.appendChild(headingGroup);
        header.appendChild(controls);

        header.addEventListener(
            "dblclick",
            () => {
                this.toggleExecutionConsole();
            }
        );

        const body =
            document.createElement("div");

        body.className =
            "execution-console-body";

        body.setAttribute(
            "role",
            "log"
        );

        body.setAttribute(
            "aria-live",
            "polite"
        );

        panel.appendChild(resizeHandle);
        panel.appendChild(header);
        panel.appendChild(body);

        this.executionConsoleElement =
            panel;
        this.executionConsoleBody = body;
        this.executionConsoleStatusElement =
            statusBadge;
        this.executionConsoleToggleButton =
            toggleButton;
        this.executionConsoleAutoScrollCheckbox =
            autoScrollCheckbox;

        this.renderExecutionConsoleLogs();
        this.updateExecutionConsoleState();

        return panel;
    }

    setExecutionConsoleOpen(isOpen) {
        this.executionConsoleOpen =
            Boolean(isOpen);

        this.updateExecutionConsoleState();

        if (
            this.executionConsoleOpen &&
            this.executionConsoleAutoScroll
        ) {
            requestAnimationFrame(
                () => {
                    this.scrollExecutionConsoleToBottom();
                }
            );
        }
    }

    toggleExecutionConsole() {
        this.setExecutionConsoleOpen(
            !this.executionConsoleOpen
        );
    }

    updateExecutionConsoleState() {
        if (this.executionConsoleElement) {
            this.executionConsoleElement.classList.toggle(
                "open",
                this.executionConsoleOpen
            );

            this.executionConsoleElement.style.height =
                this.executionConsoleOpen
                    ? `${this.executionConsoleHeight}px`
                    : "34px";
        }

        if (this.executionConsoleToggleButton) {
            this.executionConsoleToggleButton.textContent =
                this.executionConsoleOpen
                    ? "⌄"
                    : "⌃";

            this.executionConsoleToggleButton.setAttribute(
                "aria-expanded",
                String(this.executionConsoleOpen)
            );
        }

        if (this.executionConsoleViewCheckbox) {
            this.executionConsoleViewCheckbox.checked =
                this.executionConsoleOpen;
        }

        if (this.executionConsoleToolbarButton) {
            this.executionConsoleToolbarButton.classList.toggle(
                "active",
                this.executionConsoleOpen
            );

            this.executionConsoleToolbarButton.setAttribute(
                "aria-pressed",
                String(this.executionConsoleOpen)
            );
        }

        if (this.executionConsoleStatusElement) {
            const status =
                this.executionConsoleStatus ||
                "idle";

            this.executionConsoleStatusElement.textContent =
                status;

            this.executionConsoleStatusElement.className =
                `execution-console-status status-${status}`;
        }
    }

    setExecutionConsoleStatus(status) {
        const allowed = new Set([
            "idle",
            "running",
            "paused",
            "finished",
            "warning",
            "error",
            "stopped"
        ]);

        this.executionConsoleStatus =
            allowed.has(status)
                ? status
                : "idle";

        this.updateExecutionConsoleState();
    }

    startExecutionConsoleResize(event) {
        if (
            event.button !== 0 ||
            !this.executionConsoleOpen
        ) {
            return;
        }

        event.preventDefault();

        const handle =
            event.currentTarget;

        const startY =
            event.clientY;

        const startHeight =
            this.executionConsoleHeight;

        handle.setPointerCapture(
            event.pointerId
        );

        this.executionConsoleElement?.classList.add(
            "resizing"
        );

        const resize = (moveEvent) => {
            const deltaY =
                moveEvent.clientY -
                startY;

            this.executionConsoleHeight =
                Math.max(
                    this.executionConsoleMinHeight,
                    Math.min(
                        this.executionConsoleMaxHeight,
                        startHeight - deltaY
                    )
                );

            if (
                this.executionConsoleElement
            ) {
                this.executionConsoleElement.style.height =
                    `${this.executionConsoleHeight}px`;
            }
        };

        const stop = (stopEvent) => {
            handle.removeEventListener(
                "pointermove",
                resize
            );
            handle.removeEventListener(
                "pointerup",
                stop
            );
            handle.removeEventListener(
                "pointercancel",
                stop
            );

            if (
                handle.hasPointerCapture(
                    stopEvent.pointerId
                )
            ) {
                handle.releasePointerCapture(
                    stopEvent.pointerId
                );
            }

            this.executionConsoleElement?.classList.remove(
                "resizing"
            );
        };

        handle.addEventListener(
            "pointermove",
            resize
        );
        handle.addEventListener(
            "pointerup",
            stop
        );
        handle.addEventListener(
            "pointercancel",
            stop
        );
    }

    clearExecutionConsole() {
        this.executionLogEntries = [];
        this.renderExecutionConsoleLogs();
    }

    formatExecutionLogValue(value) {
        if (value === undefined) {
            return "<undefined>";
        }

        if (value === null) {
            return "null";
        }

        let text;

        if (
            typeof value === "object"
        ) {
            try {
                text = JSON.stringify(value);
            } catch (error) {
                text = String(value);
            }
        } else {
            text = String(value);
        }

        if (text === "") {
            return "<empty>";
        }

        const maximumLength = 180;

        return text.length > maximumLength
            ? `${text.slice(0, maximumLength)}…`
            : text;
    }

    getWidgetInputLogSummary(widget) {
        if (
            !widget ||
            !Array.isArray(widget.inputs) ||
            widget.inputs.length === 0
        ) {
            return "No inputs";
        }

        return widget.inputs
            .map(
                (input) =>
                    `${input.name}: ${this.formatExecutionLogValue(input.value)}`
            )
            .join(" · ");
    }

    getWidgetOutputLogSummary(widget) {
        if (
            !widget ||
            !Array.isArray(widget.outputs) ||
            widget.outputs.length === 0
        ) {
            return "No outputs";
        }

        return widget.outputs
            .map(
                (output) =>
                    `${output.name}: ${this.formatExecutionLogValue(output.value)}`
            )
            .join(" · ");
    }

    appendExecutionLog(
        level,
        message,
        detail = "",
        options = {}
    ) {
        const allowedLevels = new Set([
            "info",
            "node",
            "success",
            "warning",
            "error"
        ]);

        const normalizedLevel =
            allowedLevels.has(level)
                ? level
                : "info";

        const now = new Date();

        const timestamp =
            now.toLocaleTimeString(
                [],
                {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                }
            );

        const entry = {
            id:
                `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            timestamp,
            level: normalizedLevel,
            message: String(message || ""),
            detail: String(detail || "")
        };

        this.executionLogEntries.push(
            entry
        );

        if (
            this.executionLogEntries.length >
            this.executionLogLimit
        ) {
            this.executionLogEntries.splice(
                0,
                this.executionLogEntries.length -
                    this.executionLogLimit
            );
        }

        if (this.executionConsoleBody) {
            const empty =
                this.executionConsoleBody.querySelector(
                    ".execution-console-empty"
                );

            if (empty) {
                empty.remove();
            }

            this.executionConsoleBody.appendChild(
                this.createExecutionLogElement(
                    entry
                )
            );

            while (
                this.executionConsoleBody.children.length >
                this.executionLogLimit
            ) {
                this.executionConsoleBody.firstElementChild?.remove();
            }
        }

        if (options.open === true) {
            this.setExecutionConsoleOpen(true);
        }

        if (
            this.executionConsoleAutoScroll
        ) {
            requestAnimationFrame(
                () => {
                    this.scrollExecutionConsoleToBottom();
                }
            );
        }

        return entry;
    }

    createExecutionLogElement(entry) {
        const row =
            document.createElement("div");

        row.className =
            `execution-log-entry log-${entry.level}`;

        const time =
            document.createElement("span");

        time.className =
            "execution-log-time";
        time.textContent =
            `[${entry.timestamp}]`;

        const badge =
            document.createElement("span");

        badge.className =
            "execution-log-level";
        badge.textContent =
            entry.level === "node"
                ? "NODE"
                : entry.level.toUpperCase();

        const content =
            document.createElement("div");

        content.className =
            "execution-log-content";

        const message =
            document.createElement("span");

        message.className =
            "execution-log-message";
        message.textContent =
            entry.message;

        content.appendChild(message);

        if (entry.detail) {
            const detail =
                document.createElement("span");

            detail.className =
                "execution-log-detail";
            detail.textContent =
                entry.detail;

            content.appendChild(detail);
        }

        row.appendChild(time);
        row.appendChild(badge);
        row.appendChild(content);

        return row;
    }

    renderExecutionConsoleLogs() {
        if (!this.executionConsoleBody) {
            return;
        }

        this.executionConsoleBody.innerHTML =
            "";

        if (
            this.executionLogEntries.length === 0
        ) {
            const empty =
                document.createElement("div");

            empty.className =
                "execution-console-empty";

            empty.textContent =
                "No execution logs yet. Run or validate the workflow to see activity here.";

            this.executionConsoleBody.appendChild(
                empty
            );

            return;
        }

        this.executionLogEntries.forEach(
            (entry) => {
                this.executionConsoleBody.appendChild(
                    this.createExecutionLogElement(
                        entry
                    )
                );
            }
        );

        if (
            this.executionConsoleAutoScroll
        ) {
            this.scrollExecutionConsoleToBottom();
        }
    }

    scrollExecutionConsoleToBottom() {
        if (!this.executionConsoleBody) {
            return;
        }

        this.executionConsoleBody.scrollTop =
            this.executionConsoleBody.scrollHeight;
    }

    logValidationReport(
        report,
        { open = false } = {}
    ) {
        if (!report) {
            return;
        }

        if (report.valid) {
            this.appendExecutionLog(
                "success",
                "Workflow validation passed.",
                report.warnings.length > 0
                    ? `${report.warnings.length} warning(s)`
                    : "No blocking issues",
                { open }
            );
        } else {
            this.appendExecutionLog(
                "error",
                "Workflow validation failed.",
                `${report.errors.length} error(s), ${report.warnings.length} warning(s)`,
                { open }
            );
        }

        report.errors.forEach(
            (error) => {
                this.appendExecutionLog(
                    "error",
                    error
                );
            }
        );

        report.warnings.forEach(
            (warning) => {
                this.appendExecutionLog(
                    "warning",
                    warning
                );
            }
        );
    }

    createStatsBar() {
        const statsBar = document.createElement("footer");
        statsBar.className = "stats-bar";
        statsBar.dataset.tour = "stats-bar";

        this.widgetCountElement =
            document.createElement("span");

        this.runtimeElement =
            document.createElement("span");

        this.spaceElement =
            document.createElement("span");

        this.positionElement =
            document.createElement("span");

        statsBar.appendChild(this.widgetCountElement);
        statsBar.appendChild(this.runtimeElement);
        statsBar.appendChild(this.spaceElement);
        statsBar.appendChild(this.positionElement);

        return statsBar;
    }

    createWidget(type = "Process") {
        this.recordHistoryState();

        const id = `widget-${this.nextWidgetNumber}`;

        const title = `${type} ${this.nextWidgetNumber}`;

        const offset = (this.nextWidgetNumber - 1) * 30;

        const center =
            this.screenToWorkspace(
                this.workspaceContainer.getBoundingClientRect().left +
                    this.workspaceContainer.clientWidth / 2,

                this.workspaceContainer.getBoundingClientRect().top +
                    this.workspaceContainer.clientHeight / 2
            );

        const widget = new Widget(
            this,
            id,
            title,
            type,
            center.x + offset,
            center.y + offset
        );

        this.nextWidgetNumber += 1;

        this.addWidget(widget);
        this.selectWidget(widget);

        return widget;
    }

    addWidget(widget) {
        const widgetElement = widget.render();

        if (
            typeof widget.zIndex !== "number"
        ) {
            widget.zIndex =
                this.nextWidgetZIndex;

            this.nextWidgetZIndex += 1;
        } else {
            /*
            * If we're restoring a saved widget,
            * make sure future z-index values stay
            * above the restored value.
            */
            this.nextWidgetZIndex =
                Math.max(
                    this.nextWidgetZIndex,
                    widget.zIndex + 1
                );
        }

        widgetElement.style.zIndex =
            String(widget.zIndex);

        this.workspace.appendChild(widgetElement);
        this.widgets.push(widget);

        this.updateStats();
        this.updateWorkflowMap();

        this.scheduleSave();
    }

    removeWidget(widget) {
        const widgetIndex = this.widgets.indexOf(widget);

        if (widgetIndex === -1) {
            return;
        }

        this.recordHistoryState();

        this.removeConnectionsForWidget(
            widget
        );

        if (widget.element) {
            widget.element.remove();
        }

        if (
            this.hoverPeekWidget ===
            widget
        ) {
            this.hoverPeekWidget =
                null;
        }

        if (
            this.pinnedPeekWidget ===
            widget
        ) {
            this.pinnedPeekWidget =
                null;
        }

        this.widgets.splice(widgetIndex, 1);

        if (this.selectedWidget === widget) {
            this.selectedWidget = null;
            this.showNoSelectionMessage();
        }

        this.updateWidgetPeek();
        this.updateStats();
        this.updateWorkflowMap();
        this.scheduleSave();
    }

    bringWidgetToFront(
        widget,
        recordHistory = false
    ) {
        if (
            !widget ||
            !widget.element
        ) {
            return;
        }

        const highestZIndex =
            this.widgets.reduce(
                (highest, currentWidget) =>
                    Math.max(
                        highest,
                        this.getWidgetZIndex(
                            currentWidget
                        )
                    ),
                2
            );

        /*
         * If it is already the top-most widget,
         * there is nothing to reorder.
         */
        if (
            this.getWidgetZIndex(widget) >=
            highestZIndex
        ) {
            return;
        }

        if (recordHistory) {
            this.recordHistoryState();
        }

        widget.zIndex =
            this.nextWidgetZIndex;

        this.nextWidgetZIndex += 1;

        widget.element.style.zIndex =
            String(widget.zIndex);

        this.updateWidgetPeek();
        this.updateConnectionPeek();

        this.scheduleSave();
    }

    sendWidgetToBack(
        widget,
        recordHistory = true
    ) {
        if (
            !widget ||
            !widget.element ||
            !this.widgets.includes(widget)
        ) {
            return;
        }

        const orderedWidgets =
            [...this.widgets].sort(
                (widgetA, widgetB) =>
                    this.getWidgetZIndex(widgetA) -
                    this.getWidgetZIndex(widgetB)
            );

        if (
            orderedWidgets[0] ===
            widget
        ) {
            return;
        }

        if (recordHistory) {
            this.recordHistoryState();
        }

        const reorderedWidgets = [
            widget,
            ...orderedWidgets.filter(
                (currentWidget) =>
                    currentWidget !== widget
            )
        ];

        reorderedWidgets.forEach(
            (currentWidget, index) => {
                currentWidget.zIndex =
                    3 + index;

                if (currentWidget.element) {
                    currentWidget.element.style.zIndex =
                        String(
                            currentWidget.zIndex
                        );
                }
            }
        );

        this.nextWidgetZIndex =
            3 + reorderedWidgets.length;

        this.updateWidgetPeek();
        this.updateConnectionPeek();

        this.scheduleSave();
    }

    getWidgetZIndex(widget) {
        if (
            !widget ||
            typeof widget.zIndex !== "number"
        ) {
            return 2;
        }

        return widget.zIndex;
    }

    getOverlapRect(
        widgetA,
        widgetB
    ) {
        if (
            !widgetA ||
            !widgetB ||
            typeof widgetA.getBounds !==
                "function" ||
            typeof widgetB.getBounds !==
                "function"
        ) {
            return null;
        }

        const boundsA =
            widgetA.getBounds();

        const boundsB =
            widgetB.getBounds();

        if (
            !boundsA ||
            !boundsB
        ) {
            return null;
        }

        const left =
            Math.max(
                boundsA.left,
                boundsB.left
            );

        const right =
            Math.min(
                boundsA.right,
                boundsB.right
            );

        const top =
            Math.max(
                boundsA.top,
                boundsB.top
            );

        const bottom =
            Math.min(
                boundsA.bottom,
                boundsB.bottom
            );


        /*
        * No positive-width/height intersection
        * means the widgets do not overlap.
        */
        if (
            right <= left ||
            bottom <= top
        ) {
            return null;
        }


        const width =
            right - left;

        const height =
            bottom - top;


        return {
            left,
            right,
            top,
            bottom,

            width,
            height,

            area:
                width * height
        };
    }

    widgetsOverlap(
        widgetA,
        widgetB
    ) {
        return (
            this.getOverlapRect(
                widgetA,
                widgetB
            ) !== null
        );
    }

    getOverlappingWidgets(widget) {
        return this.widgets
            .filter(
                (otherWidget) => {
                    return (
                        otherWidget !== widget &&
                        this.widgetsOverlap(
                            widget,
                            otherWidget
                        )
                    );
                }
            )
            .map(
                (otherWidget) => {
                    return {
                        widget:
                            otherWidget,

                        overlap:
                            this.getOverlapRect(
                                widget,
                                otherWidget
                            ),

                        zIndex:
                            this.getWidgetZIndex(
                                otherWidget
                            )
                    };
                }
            )
            .sort(
                (a, b) =>
                    b.zIndex -
                    a.zIndex
            );
    }

    getCoveringWidgets(widget) {
        const widgetZIndex =
            this.getWidgetZIndex(
                widget
            );

        return this
            .getOverlappingWidgets(
                widget
            )
            .filter(
                (overlapInfo) => {
                    return (
                        overlapInfo.zIndex >
                        widgetZIndex
                    );
                }
            );
    }

    clearWidgetPeekVisuals() {
        this.widgets.forEach(
            (widget) => {
                if (!widget.element) {
                    return;
                }

                widget.element.classList.remove(
                    "peek-covering",
                    "peek-revealed"
                );
            }
        );

        this.peekOutlineElements.forEach(
            (element) => {
                element.remove();
            }
        );

        this.peekOutlineElements = [];
    }

    updateWidgetPeek() {
        this.clearWidgetPeekVisuals();

        /*
        * A clicked/pinned widget takes priority
        * over a temporary hover.
        */
        const peekWidget =
            this.pinnedPeekWidget ||
            this.hoverPeekWidget;

        if (
            !peekWidget ||
            !this.widgets.includes(peekWidget) ||
            !peekWidget.element
        ) {
            return;
        }

        const coveringWidgets =
            this.getCoveringWidgets(
                peekWidget
            );

        if (
            coveringWidgets.length === 0
        ) {
            return;
        }


        /*
        * Emphasize the widget the user
        * is trying to look at.
        */
        peekWidget.element.classList.add(
            "peek-revealed"
        );


        coveringWidgets.forEach(
            (overlapInfo) => {
                const coveringWidget =
                    overlapInfo.widget;

                const overlap =
                    overlapInfo.overlap;


                /*
                * Fade the widget sitting above.
                */
                if (coveringWidget.element) {
                    coveringWidget.element
                        .classList.add(
                            "peek-covering"
                        );
                }


                /*
                * Draw an outline showing the
                * exact region where they overlap.
                */
                if (overlap) {
                    const outline =
                        document.createElement(
                            "div"
                        );

                    outline.className =
                        "overlap-peek-outline";

                    outline.style.left =
                        `${overlap.left}px`;

                    outline.style.top =
                        `${overlap.top}px`;

                    outline.style.width =
                        `${overlap.width}px`;

                    outline.style.height =
                        `${overlap.height}px`;

                    this.workspace.appendChild(
                        outline
                    );

                    this.peekOutlineElements.push(
                        outline
                    );
                }
            }
        );
    }

    startWidgetPeek(widget) {
        if (!widget) {
            return;
        }

        this.hoverPeekWidget =
            widget;

        this.updateWidgetPeek();
    }

    stopWidgetPeek(widget) {
        if (
            this.hoverPeekWidget !==
            widget
        ) {
            return;
        }

        this.hoverPeekWidget =
            null;

        this.updateWidgetPeek();
    }

    pinWidgetPeek(widget) {
        if (!widget) {
            this.pinnedPeekWidget =
                null;

            this.updateWidgetPeek();

            return;
        }

        const coveringWidgets =
            this.getCoveringWidgets(
                widget
            );

        /*
        * Only pin Peek Mode when there
        * is actually something covering
        * this widget.
        */
        if (
            coveringWidgets.length === 0
        ) {
            this.pinnedPeekWidget =
                null;
        } else {
            this.pinnedPeekWidget =
                widget;
        }

        this.updateWidgetPeek();
    }

    clearPinnedWidgetPeek() {
        this.pinnedPeekWidget =
            null;

        this.updateWidgetPeek();
    }

    clearAllWidgetPeek() {
        this.hoverPeekWidget =
            null;

        this.pinnedPeekWidget =
            null;

        this.clearWidgetPeekVisuals();
    }

    getTopWidget(
        widgetA,
        widgetB
    ) {
        if (
            !this.widgetsOverlap(
                widgetA,
                widgetB
            )
        ) {
            return null;
        }

        const zA =
            this.getWidgetZIndex(
                widgetA
            );

        const zB =
            this.getWidgetZIndex(
                widgetB
            );

        return (
            zA >= zB
                ? widgetA
                : widgetB
        );
    }

    connectionIntersectsWidget(
        connection,
        widget
    ) {
        if (
            !connection ||
            !connection.element ||
            !widget ||
            typeof widget.getBounds !==
                "function"
        ) {
            return false;
        }

        const bounds =
            widget.getBounds();

        if (!bounds) {
            return false;
        }

        const path =
            connection.element;

        let totalLength;

        try {
            totalLength =
                path.getTotalLength();
        } catch (error) {
            return false;
        }


        /*
        * Check the route very frequently so
        * smaller overlaps aren't missed.
        */
        const sampleCount =
            Math.max(
                2,
                Math.ceil(
                    totalLength / 4
                )
            );


        /*
        * A small tolerance catches lines that
        * pass extremely close to a widget edge.
        */
        const padding = 6;


        /*
        * Ignore a short distance immediately
        * beside the source/output and target/input.
        *
        * Otherwise every connection would count
        * as "covering" its source and target simply
        * because it touches their ports.
        */
        const endpointIgnoreDistance = 24;


        for (
            let i = 0;
            i <= sampleCount;
            i += 1
        ) {
            const distance =
                (
                    totalLength *
                    i
                ) /
                sampleCount;


            /*
            * Ignore the normal connection exit
            * from its source widget.
            */
            if (
                widget ===
                    connection.sourceWidget &&
                distance <
                    endpointIgnoreDistance
            ) {
                continue;
            }


            /*
            * Ignore the normal final approach
            * into the target widget.
            */
            if (
                widget ===
                    connection.targetWidget &&
                totalLength - distance <
                    endpointIgnoreDistance
            ) {
                continue;
            }


            const point =
                path.getPointAtLength(
                    distance
                );


            if (
                point.x >=
                    bounds.left -
                        padding &&
                point.x <=
                    bounds.right +
                        padding &&
                point.y >=
                    bounds.top -
                        padding &&
                point.y <=
                    bounds.bottom +
                        padding
            ) {
                return true;
            }
        }


        return false;
    }

    getWidgetsCoveringConnection(
        connection
    ) {
        return this.widgets.filter(
            (widget) => {
                return (
                    this.connectionIntersectsWidget(
                        connection,
                        widget
                    )
                );
            }
        );
    }

    clearConnectionPeekVisuals() {
        this.widgets.forEach(
            (widget) => {
                if (widget.element) {
                    widget.element
                        .classList.remove(
                            "connection-peek-covering"
                        );
                }
            }
        );


        this.connections.forEach(
            (connection) => {
                if (connection.element) {
                    connection.element
                        .classList.remove(
                            "connection-peek-active"
                        );
                }
            }
        );


        /*
        * STEP 3:
        * Remove any old highlighted input/output ports.
        */
        document
            .querySelectorAll(
                ".connection-peek-port"
            )
            .forEach(
                (port) => {
                    port.classList.remove(
                        "connection-peek-port"
                    );
                }
            );
    }

    updateConnectionPeek() {
        this.clearConnectionPeekVisuals();


        if (
            this.hoverPeekConnections
                .length === 0
        ) {
            return;
        }


        this.hoverPeekConnections.forEach(
            (connection) => {

                if (!connection.element) {
                    return;
                }


                /*
                * Make the connection itself
                * visually prominent.
                */
                connection.element.classList.add(
                    "connection-peek-active"
                );


                /*
                * Find widgets obstructing
                * this particular path.
                */
                const coveringWidgets =
                    this.getWidgetsCoveringConnection(
                        connection
                    );


                coveringWidgets.forEach(
                    (widget) => {
                        if (widget.element) {
                            widget.element
                                .classList.add(
                                    "connection-peek-covering"
                                );
                        }
                    }
                );

                /*
                * Endpoint highlighting is only needed
                * when some portion of this connection
                * is actually obscured.
                */
                if (coveringWidgets.length > 0) {
                    const sourcePort =
                        connection.sourceWidget
                            .getOutputPortElement(
                                connection.sourcePortId
                            );

                    const targetPort =
                        connection.targetWidget
                            .getInputPortElement(
                                connection.targetPortId
                            );


                    if (sourcePort) {
                        sourcePort.classList.add(
                            "connection-peek-port"
                        );
                    }


                    if (targetPort) {
                        targetPort.classList.add(
                            "connection-peek-port"
                        );
                    }
                }
            }
        );
    }

    startConnectionPeek(
        connection
    ) {
        if (!connection) {
            return;
        }

        this.hoverPeekConnections =
            [connection];

        this.updateConnectionPeek();
    }

    stopConnectionPeek(
        connection
    ) {
        if (
            !this.hoverPeekConnections
                .includes(connection)
        ) {
            return;
        }

        this.hoverPeekConnections = [];

        this.updateConnectionPeek();
    }

    startInputConnectionPeek(
        widget,
        inputPortId = null
    ) {
        if (!widget) {
            return;
        }

        const incomingConnections =
            this.connections.filter(
                (connection) => {
                    if (
                        connection.targetWidget !==
                        widget
                    ) {
                        return false;
                    }

                    if (!inputPortId) {
                        return true;
                    }

                    return (
                        connection.targetPortId ===
                        inputPortId
                    );
                }
            );

        this.hoverPeekConnections =
            incomingConnections;

        this.updateConnectionPeek();
    }

    stopInputConnectionPeek(
        widget,
        inputPortId = null
    ) {
        this.hoverPeekConnections = [];
        this.updateConnectionPeek();
    }

    async handleKeyDown(event) {
        if (this.tutorialActive) {
            if (event.key === "Escape") {
                event.preventDefault();
                this.finishInterfaceTutorial();
                return;
            }
            if (event.key === "ArrowRight") {
                event.preventDefault();
                this.nextTutorialStep();
                return;
            }
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                this.previousTutorialStep();
                return;
            }
        }

        const activeElement = document.activeElement;

        const isTyping =
            activeElement &&
            (
                activeElement.tagName === "INPUT" ||
                activeElement.tagName === "TEXTAREA" ||
                activeElement.tagName === "SELECT" ||
                activeElement.isContentEditable
            );

        if (isTyping) {
            return;
        }

        /* While a custom dialog is open, it owns keyboard input. */
        if (this.activeDialog) {
            return;
        }

        const modifierKey =
            event.ctrlKey ||
            event.metaKey;

        if (
            modifierKey &&
            event.code === "Backquote"
        ) {
            event.preventDefault();
            this.toggleExecutionConsole();
            return;
        }

        if (
            modifierKey &&
            !event.shiftKey &&
            event.key.toLowerCase() === "z"
        ) {
            event.preventDefault();
            this.undo();
            return;
        }

        if (
            modifierKey &&
            (
                event.key.toLowerCase() === "y" ||
                (
                    event.shiftKey &&
                    event.key.toLowerCase() === "z"
                )
            )
        ) {
            event.preventDefault();
            this.redo();
            return;
        }

        if (
            modifierKey &&
            event.key.toLowerCase() === "d"
        ) {
            event.preventDefault();

            if (this.selectedWidget) {
                this.duplicateWidget(
                    this.selectedWidget
                );
            }

            return;
        }

        if (
            modifierKey &&
            event.key.toLowerCase() === "s"
        ) {
            event.preventDefault();
            this.exportWorkflow();
            return;
        }

        if (
            modifierKey &&
            event.key === "."
        ) {
            if (this.isWorkflowRunning) {
                event.preventDefault();
                this.toggleWorkflowPause();
            }
            return;
        }

        if (
            modifierKey &&
            event.shiftKey &&
            event.key === "Enter"
        ) {
            event.preventDefault();
            this.runSelectedWidget();
            return;
        }

        if (
            modifierKey &&
            event.altKey &&
            event.key === "Enter"
        ) {
            event.preventDefault();
            this.runFromSelectedWidget();
            return;
        }

        if (
            modifierKey &&
            event.key === "Enter"
        ) {
            event.preventDefault();
            this.runWorkflow();
            return;
        }

        if (event.key === "Escape") {
            this.clearPinnedWidgetPeek();
            this.hideContextMenu();
            this.selectWidget(null);
            return;
        }

        if (
            event.key === "Delete" &&
            this.selectedConnection
        ) {
            event.preventDefault();

            const confirmed =
                await this.showConfirmDialog({
                    title: "Delete Connection",
                    message:
                        `Delete connection from "${this.selectedConnection.sourceWidget.title}" to "${this.selectedConnection.targetWidget.title}"?`,
                    confirmLabel: "Delete",
                    danger: true
                });

            if (confirmed) {
                this.removeConnection(
                    this.selectedConnection
                );
            }

            return;
        }

        if (
            event.key === "Delete" &&
            this.selectedWidget
        ) {
            event.preventDefault();

            const confirmed =
                await this.showConfirmDialog({
                    title: "Delete Widget",
                    message:
                        `Delete "${this.selectedWidget.title}"?`,
                    confirmLabel: "Delete",
                    danger: true
                });

            if (confirmed) {
                this.removeWidget(
                    this.selectedWidget
                );
            }
        }
    }

    selectWidget(widget) {
        this.clearConnectionSelection();

        this.widgets.forEach(
            (currentWidget) => {
                currentWidget.setSelected(
                    currentWidget === widget
                );
            }
        );

        this.selectedWidget = widget;

        if (widget) {
            this.showWidgetProperties(
                widget
            );
        } else {
            this.showNoSelectionMessage();
        }

        this.updateStats();
        this.updateWorkflowMap();
        this.updateRunControls();
    }

    selectConnection(connection) {
        /*
         * Remove old connection selection.
         */
        this.clearConnectionSelection();

        /*
         * Deselect widgets without calling selectWidget(),
         * because selectWidget() intentionally clears
         * connection selection.
         */
        this.widgets.forEach(
            (widget) => {
                widget.setSelected(false);
            }
        );

        this.selectedWidget = null;

        if (!connection) {
            this.showNoSelectionMessage();
            this.updateStats();
            this.updateWorkflowMap();
            this.updateRunControls();
            return;
        }

        this.selectedConnection =
            connection;

        if (connection.element) {
            connection.element.classList.add(
                "connection-selected"
            );
        }

        this.showConnectionProperties(
            connection
        );

        this.updateStats();
        this.updateWorkflowMap();
        this.updateRunControls();
    }

    clearConnectionSelection() {
        if (
            this.selectedConnection &&
            this.selectedConnection.element
        ) {
            this.selectedConnection.element
                .classList.remove(
                    "connection-selected"
                );
        }

        this.selectedConnection = null;
    }

    closeDataPreview() {
        if (!this.activeDataInspector) {
            return;
        }

        this.activeDataInspector.remove();
        this.activeDataInspector = null;
    }

    getDataPreviewSummary(value) {
        if (Array.isArray(value)) {
            return `${value.length} item${value.length === 1 ? "" : "s"}`;
        }

        if (
            value &&
            typeof value === "object"
        ) {
            const count = Object.keys(value).length;
            return `${count} field${count === 1 ? "" : "s"}`;
        }

        if (typeof value === "string") {
            return `${value.length} character${value.length === 1 ? "" : "s"}`;
        }

        return typeof value;
    }

    buildDataPreviewContent(value) {
        const container =
            document.createElement("div");
        container.className =
            "data-inspector-content";

        const makeCellText = (cellValue) => {
            if (
                cellValue &&
                typeof cellValue === "object"
            ) {
                try {
                    return JSON.stringify(cellValue);
                } catch (error) {
                    return String(cellValue);
                }
            }

            return String(cellValue ?? "");
        };

        if (
            Array.isArray(value) &&
            value.length > 0 &&
            value.every(
                (item) =>
                    item &&
                    typeof item === "object" &&
                    !Array.isArray(item)
            )
        ) {
            const columns = [];
            value.slice(0, 10).forEach(
                (row) => {
                    Object.keys(row).forEach(
                        (key) => {
                            if (
                                !columns.includes(key) &&
                                columns.length < 6
                            ) {
                                columns.push(key);
                            }
                        }
                    );
                }
            );

            const tableWrap =
                document.createElement("div");
            tableWrap.className =
                "data-preview-table-wrap";

            const table =
                document.createElement("table");
            table.className =
                "data-preview-table";

            const head =
                document.createElement("thead");
            const headRow =
                document.createElement("tr");

            columns.forEach(
                (column) => {
                    const th =
                        document.createElement("th");
                    th.textContent = column;
                    headRow.appendChild(th);
                }
            );

            head.appendChild(headRow);
            table.appendChild(head);

            const body =
                document.createElement("tbody");

            value.slice(0, 10).forEach(
                (row) => {
                    const tr =
                        document.createElement("tr");

                    columns.forEach(
                        (column) => {
                            const td =
                                document.createElement("td");
                            td.textContent =
                                makeCellText(row[column]);
                            tr.appendChild(td);
                        }
                    );

                    body.appendChild(tr);
                }
            );

            table.appendChild(body);
            tableWrap.appendChild(table);
            container.appendChild(tableWrap);
        } else if (Array.isArray(value)) {
            const table =
                document.createElement("table");
            table.className =
                "data-preview-table data-preview-indexed-table";

            const body =
                document.createElement("tbody");

            value.slice(0, 12).forEach(
                (item, index) => {
                    const tr =
                        document.createElement("tr");
                    const indexCell =
                        document.createElement("th");
                    indexCell.textContent =
                        String(index);
                    const valueCell =
                        document.createElement("td");
                    valueCell.textContent =
                        makeCellText(item);
                    tr.appendChild(indexCell);
                    tr.appendChild(valueCell);
                    body.appendChild(tr);
                }
            );

            table.appendChild(body);
            container.appendChild(table);
        } else if (
            value &&
            typeof value === "object"
        ) {
            const pre =
                document.createElement("pre");
            pre.className =
                "data-preview-code";

            try {
                pre.textContent =
                    JSON.stringify(
                        value,
                        null,
                        2
                    );
            } catch (error) {
                pre.textContent = String(value);
            }

            container.appendChild(pre);
        } else {
            const pre =
                document.createElement("pre");
            pre.className =
                "data-preview-code data-preview-scalar";
            pre.textContent =
                value === "" ||
                value === null ||
                value === undefined
                    ? "<empty>"
                    : String(value);
            container.appendChild(pre);
        }

        return container;
    }

    showDataPreview({
        widget = null,
        port = null,
        direction = "",
        title = "Data Preview",
        value = undefined,
        dataType = null,
        subtitle = ""
    } = {}) {
        this.closeDataPreview();

        const previewValue =
            value !== undefined
                ? value
                : port
                    ? port.value
                    : "";

        const normalizedType =
            dataType ||
            (port
                ? this.getPortDataType(port)
                : "Any");

        const overlay =
            document.createElement("div");
        overlay.className =
            "data-inspector-overlay";

        const panel =
            document.createElement("section");
        panel.className =
            "data-inspector";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");
        panel.setAttribute("aria-label", title);

        const header =
            document.createElement("div");
        header.className =
            "data-inspector-header";

        const headingWrap =
            document.createElement("div");
        headingWrap.className =
            "data-inspector-heading";

        const heading =
            document.createElement("h2");
        heading.textContent = title;

        const meta =
            document.createElement("div");
        meta.className =
            "data-inspector-meta";
        meta.textContent =
            `${normalizedType} · ${this.getDataPreviewSummary(previewValue)}` +
            (subtitle ? ` · ${subtitle}` : "");

        headingWrap.appendChild(heading);
        headingWrap.appendChild(meta);

        const closeButton =
            document.createElement("button");
        closeButton.type = "button";
        closeButton.className =
            "data-inspector-close";
        closeButton.textContent = "×";
        closeButton.title = "Close preview";
        closeButton.setAttribute(
            "aria-label",
            "Close data preview"
        );

        header.appendChild(headingWrap);
        header.appendChild(closeButton);

        const body =
            document.createElement("div");
        body.className =
            "data-inspector-body";
        body.appendChild(
            this.buildDataPreviewContent(
                previewValue
            )
        );

        const footer =
            document.createElement("div");
        footer.className =
            "data-inspector-footer";

        if (widget && port) {
            const pinButton =
                document.createElement("button");
            pinButton.type = "button";
            pinButton.className =
                "data-inspector-pin";

            const updatePinLabel = () => {
                pinButton.textContent =
                    port.pinned
                        ? "Unpin from collapsed widget"
                        : "Pin on collapsed widget";
            };

            updatePinLabel();

            pinButton.addEventListener(
                "click",
                () => {
                    this.recordHistoryState();
                    port.pinned = !port.pinned;
                    widget.refreshContent();
                    this.scheduleSave();
                    updatePinLabel();
                }
            );

            footer.appendChild(pinButton);
        }

        const closeFooterButton =
            document.createElement("button");
        closeFooterButton.type = "button";
        closeFooterButton.className =
            "data-inspector-done";
        closeFooterButton.textContent = "Done";
        footer.appendChild(closeFooterButton);

        const close = () => {
            document.removeEventListener(
                "keydown",
                keyHandler,
                true
            );
            overlay.remove();
            if (
                this.activeDataInspector ===
                overlay
            ) {
                this.activeDataInspector = null;
            }
        };

        closeButton.addEventListener(
            "click",
            close
        );
        closeFooterButton.addEventListener(
            "click",
            close
        );
        overlay.addEventListener(
            "pointerdown",
            (event) => {
                if (event.target === overlay) {
                    close();
                }
            }
        );

        const keyHandler = (event) => {
            if (
                event.key === "Escape" &&
                this.activeDataInspector === overlay
            ) {
                event.preventDefault();
                close();
                document.removeEventListener(
                    "keydown",
                    keyHandler,
                    true
                );
            }
        };

        document.addEventListener(
            "keydown",
            keyHandler,
            true
        );

        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(footer);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.activeDataInspector = overlay;

        requestAnimationFrame(
            () => {
                overlay.classList.add("visible");
                closeButton.focus();
            }
        );
    }

    showWidgetFailureDetails(widget) {
        if (!widget) {
            return;
        }

        const errorText =
            widget.lastError ||
            "No failure details are available for this widget.";

        const lower =
            errorText.toLowerCase();

        let suggestion =
            "Check the widget inputs, script/source, and data types, then run this node again.";

        if (
            lower.includes("convert") ||
            lower.includes("type") ||
            lower.includes("parse")
        ) {
            suggestion =
                "This looks like a data-type problem. Inspect the incoming value and compare the input/output types.";
        } else if (
            lower.includes("required") ||
            lower.includes("missing") ||
            lower.includes("input")
        ) {
            suggestion =
                "This looks like a missing-input problem. Check Inputs & Outputs and confirm every required input has a value or source.";
        } else if (
            lower.includes("expression") ||
            lower.includes("syntax") ||
            lower.includes("script")
        ) {
            suggestion =
                "This looks like a script/expression problem. Open Execution and check the Source field and available input variable names.";
        } else if (lower.includes("cycle")) {
            suggestion =
                "This workflow contains a dependency cycle. Remove or reroute a connection so execution has a clear direction.";
        }

        this.showMessageDialog({
            title: `Why ${widget.title} failed`,
            message:
                `${errorText}\n\nSuggested next step: ${suggestion}`,
            tone: "error",
            confirmLabel: "Close"
        });
    }

    showNoSelectionMessage() {
        if (!this.propertiesPanelContent) {
            return;
        }

        this.propertiesPanelContent.innerHTML = "";

        const message = document.createElement("p");
        message.className = "panel-description";
        message.textContent =
            "Select a widget to view and edit its properties.";

        this.propertiesPanelContent.appendChild(message);
    }

    createPropertiesSection(
        title,
        description = ""
    ) {
        const section =
            document.createElement("section");

        section.className =
            "property-section";

        const heading =
            document.createElement("div");

        heading.className =
            "property-section-title";

        heading.textContent = title;
        section.appendChild(heading);

        if (description) {
            const text =
                document.createElement("p");

            text.className =
                "property-section-description";

            text.textContent = description;
            section.appendChild(text);
        }

        const body =
            document.createElement("div");

        body.className =
            "property-section-body";

        section.appendChild(body);

        return {
            section,
            body
        };
    }

    createPropertyGroup(
        key,
        title,
        description = "",
        defaultCollapsed = false
    ) {
        const section =
            document.createElement("section");

        section.className =
            "property-group";
        section.dataset.propertyGroup = key;

        const header =
            document.createElement("button");

        header.type = "button";
        header.className =
            "property-group-toggle";

        const titleText =
            document.createElement("span");
        titleText.className =
            "property-group-title";
        titleText.textContent = title;

        const chevron =
            document.createElement("span");
        chevron.className =
            "property-group-chevron";

        header.appendChild(titleText);
        header.appendChild(chevron);

        const body =
            document.createElement("div");
        body.className =
            "property-group-body";

        if (description) {
            const text =
                document.createElement("p");
            text.className =
                "property-group-description";
            text.textContent = description;
            body.appendChild(text);
        }

        section.appendChild(header);
        section.appendChild(body);

        const storedState =
            this.propertyGroupState[key];

        const initialCollapsed =
            typeof storedState === "boolean"
                ? storedState
                : defaultCollapsed;

        const applyState =
            (collapsed) => {
                this.propertyGroupState[key] =
                    collapsed;
                section.classList.toggle(
                    "collapsed",
                    collapsed
                );
                body.hidden = collapsed;
                header.setAttribute(
                    "aria-expanded",
                    String(!collapsed)
                );
                chevron.textContent =
                    collapsed ? "›" : "⌄";
            };

        header.addEventListener(
            "click",
            () => {
                applyState(
                    !section.classList.contains(
                        "collapsed"
                    )
                );
            }
        );

        applyState(initialCollapsed);

        return {
            section,
            body,
            setCollapsed: applyState
        };
    }

    expandPropertyGroupForElement(element) {
        const group =
            element &&
            element.closest
                ? element.closest(
                    ".property-group"
                )
                : null;

        if (!group) {
            return;
        }

        const key =
            group.dataset.propertyGroup;

        if (key) {
            this.propertyGroupState[key] =
                false;
        }

        group.classList.remove(
            "collapsed"
        );

        const body =
            group.querySelector(
                ":scope > .property-group-body"
            );
        if (body) {
            body.hidden = false;
        }

        const toggle =
            group.querySelector(
                ":scope > .property-group-toggle"
            );
        if (toggle) {
            toggle.setAttribute(
                "aria-expanded",
                "true"
            );
        }

        const chevron =
            group.querySelector(
                ":scope > .property-group-toggle .property-group-chevron"
            );
        if (chevron) {
            chevron.textContent = "⌄";
        }
    }

    getPortDataType(port) {
        return Widget.normalizeDataType(
            port && port.dataType
                ? port.dataType
                : "Any"
        );
    }

    getPortTypeCompatibility(
        sourcePort,
        targetPort
    ) {
        const sourceType =
            this.getPortDataType(
                sourcePort
            );

        const targetType =
            this.getPortDataType(
                targetPort
            );

        if (
            sourceType === "Any" ||
            targetType === "Any"
        ) {
            return {
                compatible: true,
                level: "flexible",
                sourceType,
                targetType,
                message:
                    `${sourceType} → ${targetType} is allowed because one side is Any.`
            };
        }

        if (sourceType === targetType) {
            return {
                compatible: true,
                level: "exact",
                sourceType,
                targetType,
                message:
                    `${sourceType} → ${targetType} is an exact type match.`
            };
        }

        const convertiblePairs =
            new Set([
                "Number->String",
                "Boolean->String",
                "Array->String",
                "JSON->String",
                "String->Number",
                "String->Boolean",
                "String->Array",
                "String->JSON",
                "Number->Boolean",
                "Boolean->Number",
                "Number->JSON",
                "Boolean->JSON",
                "Array->JSON",
                "JSON->Array"
            ]);

        if (
            convertiblePairs.has(
                `${sourceType}->${targetType}`
            )
        ) {
            return {
                compatible: true,
                level: "convertible",
                sourceType,
                targetType,
                message:
                    `${sourceType} → ${targetType} requires runtime conversion.`
            };
        }

        return {
            compatible: false,
            level: "incompatible",
            sourceType,
            targetType,
            message:
                `${sourceType} output cannot feed a ${targetType} input.`
        };
    }

    getConnectionTypeCompatibility(
        connection
    ) {
        if (!connection) {
            return {
                compatible: false,
                level: "incompatible",
                sourceType: "Any",
                targetType: "Any",
                message: "Connection is missing."
            };
        }

        const sourcePort =
            connection.sourceWidget
                .getOutputById(
                    connection.sourcePortId
                );

        const targetPort =
            connection.targetWidget
                .getInputById(
                    connection.targetPortId
                );

        if (!sourcePort || !targetPort) {
            return {
                compatible: false,
                level: "incompatible",
                sourceType:
                    sourcePort
                        ? this.getPortDataType(sourcePort)
                        : "Missing",
                targetType:
                    targetPort
                        ? this.getPortDataType(targetPort)
                        : "Missing",
                message:
                    "Connection references a missing port."
            };
        }

        return this.getPortTypeCompatibility(
            sourcePort,
            targetPort
        );
    }

    updateConnectionTypeState(
        connection
    ) {
        if (
            !connection ||
            !connection.element
        ) {
            return;
        }

        const compatibility =
            this.getConnectionTypeCompatibility(
                connection
            );

        connection.element.classList.toggle(
            "connection-type-convertible",
            compatibility.level ===
                "convertible"
        );

        connection.element.classList.toggle(
            "connection-type-incompatible",
            !compatibility.compatible
        );

        if (connection.hitElement) {
            connection.hitElement.dataset.typeCompatibility =
                compatibility.level;

            connection.hitElement.setAttribute(
                "aria-label",
                compatibility.message
            );
        }
    }

    refreshAllConnectionTypeStates() {
        this.connections.forEach(
            (connection) => {
                this.updateConnectionTypeState(
                    connection
                );
            }
        );
    }

    coerceValueForPort(
        value,
        port,
        { smartAny = true } = {}
    ) {
        const type =
            this.getPortDataType(port);

        if (type === "Any") {
            return smartAny
                ? this.coerceWorkflowValue(
                    value
                )
                : value;
        }

        return Widget.coerceValueToType(
            value,
            type
        );
    }

    getIncomingConnections(
        widget,
        inputPortId
    ) {
        return this.connections.filter(
            (connection) =>
                connection.targetWidget ===
                    widget &&
                connection.targetPortId ===
                    inputPortId
        );
    }

    getIncomingConnection(
        widget,
        inputPortId
    ) {
        return (
            this.getIncomingConnections(
                widget,
                inputPortId
            )[0] || null
        );
    }

    refreshInputValueFromConnections(
        widget,
        inputPortId,
        { activeOnly = false } = {}
    ) {
        if (!widget) {
            return "";
        }

        const input =
            widget.getInputById(
                inputPortId
            );

        if (!input) {
            return "";
        }

        const allIncomingConnections =
            this.getIncomingConnections(
                widget,
                inputPortId
            );

        const incomingConnections =
            activeOnly
                ? allIncomingConnections.filter(
                    (connection) =>
                        this.getConnectionBranchState(
                            connection
                        ) === "active"
                )
                : allIncomingConnections;

        if (
            incomingConnections.length === 0
        ) {
            if (
                activeOnly &&
                allIncomingConnections.length > 0 &&
                String(
                    input.manualValue ?? ""
                ).trim() === ""
            ) {
                input.value = "";
                widget.refreshContent();
                return input.value;
            }

            try {
                input.value =
                    this.coerceValueForPort(
                        input.manualValue,
                        input
                    );
            } catch (error) {
                /*
                 * Keep the raw value visible while editing.
                 * Validation/execution will surface the typed error.
                 */
                input.value =
                    input.manualValue;
            }

            widget.refreshContent();
            return input.value;
        }

        const values =
            incomingConnections.map(
                (connection) => {
                    const sourceOutput =
                        connection.sourceWidget
                            .getOutputById(
                                connection.sourcePortId
                            );

                    if (!sourceOutput) {
                        return "";
                    }

                    try {
                        return this.coerceValueForPort(
                            sourceOutput.value,
                            input
                        );
                    } catch (error) {
                        return sourceOutput.value;
                    }
                }
            );

        /*
         * One source => scalar typed value.
         * Multiple sources => ordered array of values,
         * where each individual source is coerced to the
         * input's declared type.
         */
        input.value =
            values.length === 1
                ? values[0]
                : values;

        widget.refreshContent();

        return input.value;
    }

    getOutgoingConnections(
        widget,
        outputPortId
    ) {
        return this.connections.filter(
            (connection) =>
                connection.sourceWidget ===
                    widget &&
                connection.sourcePortId ===
                    outputPortId
        );
    }

    propagateOutputValue(
        sourceWidget,
        outputPortId,
        { activeOnly = false } = {}
    ) {
        if (!sourceWidget) {
            return;
        }

        const output =
            sourceWidget.getOutputById(
                outputPortId
            );

        if (!output) {
            return;
        }

        this.getOutgoingConnections(
            sourceWidget,
            outputPortId
        )
            .filter(
                (connection) =>
                    !activeOnly ||
                    this.getConnectionBranchState(
                        connection
                    ) === "active"
            )
            .forEach(
            (connection) => {
                connection.lastValue =
                    output.value;
                connection.lastUpdatedAt =
                    Date.now();
                connection.lastRunId =
                    this.isWorkflowRunning
                        ? this.executionRunId
                        : connection.lastRunId;

                if (connection.element) {
                    connection.element.classList.add(
                        "connection-transfer-active"
                    );

                    const transferStamp =
                        connection.lastUpdatedAt;

                    window.setTimeout(
                        () => {
                            if (
                                connection.lastUpdatedAt ===
                                transferStamp
                            ) {
                                connection.element?.classList.remove(
                                    "connection-transfer-active"
                                );
                            }
                        },
                        650
                    );
                }

                const targetInput =
                    connection.targetWidget
                        .getInputById(
                            connection.targetPortId
                        );

                if (targetInput) {
                    this.refreshInputValueFromConnections(
                        connection.targetWidget,
                        connection.targetPortId,
                        {
                            activeOnly
                        }
                    );
                }
            }
        );
    }

    getInputSourceSelectionValue(
        connection
    ) {
        if (!connection) {
            return "manual";
        }

        return (
            `${connection.sourceWidget.id}::` +
            `${connection.sourcePortId}`
        );
    }

    parseInputSourceSelection(
        selectionValue
    ) {
        if (
            !selectionValue ||
            selectionValue === "manual"
        ) {
            return null;
        }

        const separatorIndex =
            selectionValue.indexOf("::");

        if (separatorIndex === -1) {
            return null;
        }

        return {
            widgetId:
                selectionValue.slice(
                    0,
                    separatorIndex
                ),

            portId:
                selectionValue.slice(
                    separatorIndex + 2
                )
        };
    }

    connectInputFromSource(
        targetWidget,
        targetPortId,
        selectionValue
    ) {
        if (
            !targetWidget ||
            !targetWidget.getInputById(
                targetPortId
            )
        ) {
            return;
        }

        const input =
            targetWidget.getInputById(
                targetPortId
            );

        const existingConnections =
            this.getIncomingConnections(
                targetWidget,
                targetPortId
            );

        if (selectionValue === "manual") {
            if (
                existingConnections.length === 0
            ) {
                input.value =
                    input.manualValue;
                targetWidget.refreshContent();
                return;
            }

            this.recordHistoryState();

            existingConnections.forEach(
                (connection) => {
                    this.removeConnection(
                        connection,
                        false
                    );
                }
            );

            input.value =
                input.manualValue;

            targetWidget.refreshContent();
            this.showWidgetProperties(
                targetWidget
            );
            this.scheduleSave();
            return;
        }

        const sourceSelection =
            this.parseInputSourceSelection(
                selectionValue
            );

        if (!sourceSelection) {
            return;
        }

        const sourceWidget =
            this.widgets.find(
                (widget) =>
                    widget.id ===
                    sourceSelection.widgetId
            );

        const sourcePort =
            sourceWidget
                ? sourceWidget.getOutputById(
                    sourceSelection.portId
                )
                : null;

        if (
            !sourceWidget ||
            !sourcePort ||
            sourceWidget === targetWidget
        ) {
            return;
        }

        const compatibility =
            this.getPortTypeCompatibility(
                sourcePort,
                input
            );

        if (!compatibility.compatible) {
            void this.showMessageDialog({
                title: "Incompatible Port Types",
                message:
                    `${sourceWidget.title} / ${sourcePort.name} is ${compatibility.sourceType}, but ${targetWidget.title} / ${input.name} expects ${compatibility.targetType}.\n\nChoose a compatible source or change one of the port data types.`,
                tone: "warning",
                confirmLabel: "Close"
            });

            return;
        }

        const duplicate =
            existingConnections.find(
                (connection) =>
                    connection.sourceWidget ===
                        sourceWidget &&
                    connection.sourcePortId ===
                        sourcePort.id
            );

        if (duplicate) {
            return;
        }

        this.recordHistoryState();

        this.addConnection(
            sourceWidget,
            targetWidget,
            sourcePort.id,
            targetPortId
        );

        this.refreshInputValueFromConnections(
            targetWidget,
            targetPortId
        );

        this.showWidgetProperties(
            targetWidget
        );
        this.scheduleSave();
    }

    addWidgetInput(widget) {
        if (!widget) {
            return;
        }

        this.recordHistoryState();
        widget.addInput();
        this.showWidgetProperties(widget);
        this.scheduleSave();
    }

    addWidgetOutput(widget) {
        if (!widget) {
            return;
        }

        this.recordHistoryState();
        widget.addOutput();

        if (widget.type === "Decision") {
            widget.ensureDecisionConfiguration(
                false
            );
            this.clearBranchExecutionState({
                clearDecisionResults: true
            });
        }

        this.showWidgetProperties(widget);
        this.scheduleSave();
    }

    removeWidgetInput(
        widget,
        inputPortId
    ) {
        if (
            !widget ||
            !widget.getInputById(
                inputPortId
            )
        ) {
            return;
        }

        this.recordHistoryState();

        this.connections
            .filter(
                (connection) =>
                    connection.targetWidget ===
                        widget &&
                    connection.targetPortId ===
                        inputPortId
            )
            .forEach(
                (connection) => {
                    this.removeConnection(
                        connection,
                        false
                    );
                }
            );

        widget.removeInput(
            inputPortId
        );

        this.showWidgetProperties(widget);
        this.scheduleSave();
    }

    removeWidgetOutput(
        widget,
        outputPortId
    ) {
        if (
            !widget ||
            !widget.getOutputById(
                outputPortId
            )
        ) {
            return;
        }

        this.recordHistoryState();

        this.connections
            .filter(
                (connection) =>
                    connection.sourceWidget ===
                        widget &&
                    connection.sourcePortId ===
                        outputPortId
            )
            .forEach(
                (connection) => {
                    this.removeConnection(
                        connection,
                        false
                    );
                }
            );

        widget.removeOutput(
            outputPortId
        );

        if (widget.type === "Decision") {
            widget.ensureDecisionConfiguration(
                false
            );
        }

        this.showWidgetProperties(widget);
        this.scheduleSave();
    }

    showWidgetProperties(widget) {
        if (
            !this.propertiesPanelContent ||
            !widget
        ) {
            return;
        }

        if (widget.type === "Decision") {
            widget.ensureDecisionConfiguration(
                true
            );
            widget.refreshContent();
        }

        this.propertiesPanelContent.innerHTML = "";

        let decisionSection = null;

        /* =============================
         * General
         * ============================= */
        const general =
            this.createPropertiesSection(
                "General"
            );
        general.section.dataset.tour = "properties-general";

        const titleRow =
            document.createElement("div");
        titleRow.className = "property-row";

        const titleLabel =
            document.createElement("label");
        titleLabel.textContent = "Title";

        const titleInput =
            document.createElement("input");
        titleInput.type = "text";
        titleInput.value = widget.title;

        titleInput.addEventListener(
            "change",
            () => {
                const nextTitle =
                    titleInput.value.trim();

                if (
                    nextTitle === "" ||
                    nextTitle === widget.title
                ) {
                    titleInput.value =
                        widget.title;
                    return;
                }

                this.recordHistoryState();
                widget.setTitle(nextTitle);
                this.updateStats();
            }
        );

        titleRow.appendChild(titleLabel);
        titleRow.appendChild(titleInput);

        const typeRow =
            document.createElement("div");
        typeRow.className = "property-row";

        const typeLabel =
            document.createElement("label");
        typeLabel.textContent = "Type";

        const typeSelect =
            document.createElement("select");

        const knownTypes = [
            "Start",
            "Process",
            "Decision",
            "End"
        ];

        if (
            !knownTypes.includes(
                widget.type
            )
        ) {
            knownTypes.push(widget.type);
        }

        knownTypes.forEach((type) => {
            const option =
                document.createElement(
                    "option"
                );
            option.value = type;
            option.textContent = type;
            typeSelect.appendChild(option);
        });

        typeSelect.value = widget.type;

        typeSelect.addEventListener(
            "change",
            () => {
                if (
                    typeSelect.value ===
                    widget.type
                ) {
                    return;
                }

                this.recordHistoryState();
                widget.setType(
                    typeSelect.value
                );
                this.showWidgetProperties(
                    widget
                );
            }
        );

        typeRow.appendChild(typeLabel);
        typeRow.appendChild(typeSelect);

        const positionRow =
            document.createElement("div");
        positionRow.className = "property-row compact-property-row";

        const positionLabel =
            document.createElement("label");
        positionLabel.textContent = "Position";

        const positionText =
            document.createElement("div");
        positionText.className = "property-readout";
        positionText.textContent =
            `X: ${Math.round(widget.x)}, Y: ${Math.round(widget.y)}`;

        positionRow.appendChild(positionLabel);
        positionRow.appendChild(positionText);

        general.body.appendChild(titleRow);
        general.body.appendChild(typeRow);
        general.body.appendChild(positionRow);
        this.propertiesPanelContent.appendChild(
            general.section
        );


        /* =============================
         * Inputs
         * ============================= */
        const inputsSection =
            this.createPropertiesSection(
                "Inputs",
                "Connect one or more previous outputs to the same input. Multiple sources are delivered as an ordered array."
            );
        inputsSection.section.dataset.tour = "properties-inputs";

        widget.inputs.forEach(
            (input) => {
                const card =
                    document.createElement(
                        "div"
                    );
                card.className =
                    "io-property-card input-property-card";

                const nameInput =
                    document.createElement(
                        "input"
                    );
                nameInput.type = "text";
                nameInput.value = input.name;
                nameInput.placeholder = "Input name";

                nameInput.addEventListener(
                    "change",
                    () => {
                        const nextName =
                            nameInput.value.trim();

                        if (
                            nextName === "" ||
                            nextName === input.name
                        ) {
                            nameInput.value =
                                input.name;
                            return;
                        }

                        this.recordHistoryState();
                        input.name = nextName;
                        widget.refreshContent();
                        this.showWidgetProperties(
                            widget
                        );
                        this.scheduleSave();
                    }
                );

                const typeField =
                    document.createElement(
                        "div"
                    );
                typeField.className =
                    "io-type-field";

                const typeFieldLabel =
                    document.createElement(
                        "span"
                    );
                typeFieldLabel.className =
                    "io-type-label";
                typeFieldLabel.textContent =
                    "Data type";

                const dataTypeSelect =
                    document.createElement(
                        "select"
                    );
                dataTypeSelect.className =
                    "io-data-type-select";

                Widget.getDataTypes().forEach(
                    (dataType) => {
                        const option =
                            document.createElement(
                                "option"
                            );
                        option.value = dataType;
                        option.textContent = dataType;
                        dataTypeSelect.appendChild(
                            option
                        );
                    }
                );

                dataTypeSelect.value =
                    this.getPortDataType(
                        input
                    );

                dataTypeSelect.addEventListener(
                    "change",
                    () => {
                        const nextType =
                            Widget.normalizeDataType(
                                dataTypeSelect.value
                            );

                        if (
                            nextType ===
                            this.getPortDataType(
                                input
                            )
                        ) {
                            return;
                        }

                        this.recordHistoryState();
                        input.dataType = nextType;
                        this.refreshInputValueFromConnections(
                            widget,
                            input.id
                        );
                        widget.refreshContent();
                        this.refreshAllConnectionTypeStates();
                        this.showWidgetProperties(
                            widget
                        );
                        this.scheduleSave();
                    }
                );

                typeField.appendChild(
                    typeFieldLabel
                );
                typeField.appendChild(
                    dataTypeSelect
                );

                const incomingConnections =
                    this.getIncomingConnections(
                        widget,
                        input.id
                    );

                const sourceSelect =
                    document.createElement(
                        "select"
                    );
                sourceSelect.className =
                    "input-source-select";

                const placeholderOption =
                    document.createElement(
                        "option"
                    );
                placeholderOption.value = "";
                placeholderOption.textContent =
                    "+ Add source connection…";
                sourceSelect.appendChild(
                    placeholderOption
                );

                const manualOption =
                    document.createElement(
                        "option"
                    );
                manualOption.value = "manual";
                manualOption.textContent =
                    "Use manual value (disconnect all)";
                sourceSelect.appendChild(
                    manualOption
                );

                this.widgets.forEach(
                    (sourceWidget) => {
                        if (
                            sourceWidget === widget
                        ) {
                            return;
                        }

                        sourceWidget.outputs.forEach(
                            (output) => {
                                const alreadyConnected =
                                    incomingConnections.some(
                                        (connection) =>
                                            connection.sourceWidget ===
                                                sourceWidget &&
                                            connection.sourcePortId ===
                                                output.id
                                    );

                                const option =
                                    document.createElement(
                                        "option"
                                    );

                                option.value =
                                    `${sourceWidget.id}::${output.id}`;

                                const compatibility =
                                    this.getPortTypeCompatibility(
                                        output,
                                        input
                                    );

                                const compatibilityPrefix =
                                    !compatibility.compatible
                                        ? "⛔ "
                                        : compatibility.level ===
                                            "convertible"
                                            ? "↝ "
                                            : alreadyConnected
                                                ? "✓ "
                                                : "";

                                option.textContent =
                                    `${compatibilityPrefix}${sourceWidget.title} / ${output.name} [${this.getPortDataType(output)}]`;

                                option.disabled =
                                    alreadyConnected ||
                                    !compatibility.compatible;

                                option.title =
                                    compatibility.message;

                                sourceSelect.appendChild(
                                    option
                                );
                            }
                        );
                    }
                );

                sourceSelect.value = "";

                const inputMissingRequiredValue =
                    input.required !== false &&
                    incomingConnections.length === 0 &&
                    String(
                        input.manualValue ?? ""
                    ).trim() === "";

                const incompatibleIncoming =
                    incomingConnections.filter(
                        (connection) =>
                            !this.getConnectionTypeCompatibility(
                                connection
                            ).compatible
                    );

                let manualTypeError = "";

                if (
                    incomingConnections.length === 0 &&
                    String(
                        input.manualValue ?? ""
                    ).trim() !== ""
                ) {
                    try {
                        this.coerceValueForPort(
                            input.manualValue,
                            input
                        );
                    } catch (error) {
                        manualTypeError =
                            error.message;
                    }
                }

                if (
                    inputMissingRequiredValue ||
                    incompatibleIncoming.length > 0 ||
                    manualTypeError
                ) {
                    card.classList.add(
                        "invalid"
                    );
                }

                sourceSelect.addEventListener(
                    "change",
                    () => {
                        if (
                            sourceSelect.value === ""
                        ) {
                            return;
                        }

                        this.connectInputFromSource(
                            widget,
                            input.id,
                            sourceSelect.value
                        );
                    }
                );

                const connectedSources =
                    document.createElement(
                        "div"
                    );
                connectedSources.className =
                    "input-connected-sources";

                if (
                    incomingConnections.length === 0
                ) {
                    const emptySources =
                        document.createElement(
                            "div"
                        );
                    emptySources.className =
                        "input-source-empty";
                    emptySources.textContent =
                        "No connected sources";
                    connectedSources.appendChild(
                        emptySources
                    );
                } else {
                    incomingConnections.forEach(
                        (connection, index) => {
                            const sourceOutput =
                                connection.sourceWidget
                                    .getOutputById(
                                        connection.sourcePortId
                                    );

                            const row =
                                document.createElement(
                                    "div"
                                );
                            row.className =
                                "input-source-row";

                            const sourceText =
                                document.createElement(
                                    "span"
                                );
                            const compatibility =
                                this.getConnectionTypeCompatibility(
                                    connection
                                );

                            sourceText.textContent =
                                `${index + 1}. ${connection.sourceWidget.title} / ${sourceOutput ? sourceOutput.name : "output"} [${sourceOutput ? this.getPortDataType(sourceOutput) : "Missing"}]${compatibility.level === "convertible" ? " ↝ convert" : !compatibility.compatible ? " ⛔ incompatible" : ""}`;

                            row.classList.toggle(
                                "type-incompatible",
                                !compatibility.compatible
                            );

                            row.classList.toggle(
                                "type-convertible",
                                compatibility.level ===
                                    "convertible"
                            );

                            const removeSourceButton =
                                document.createElement(
                                    "button"
                                );
                            removeSourceButton.type =
                                "button";
                            removeSourceButton.className =
                                "input-source-remove";
                            removeSourceButton.textContent =
                                "Remove";

                            removeSourceButton.addEventListener(
                                "click",
                                () => {
                                    this.recordHistoryState();
                                    this.removeConnection(
                                        connection,
                                        false
                                    );
                                    this.refreshInputValueFromConnections(
                                        widget,
                                        input.id
                                    );
                                    this.showWidgetProperties(
                                        widget
                                    );
                                    this.scheduleSave();
                                }
                            );

                            row.appendChild(
                                sourceText
                            );
                            row.appendChild(
                                removeSourceButton
                            );
                            connectedSources.appendChild(
                                row
                            );
                        }
                    );
                }

                const multiSourceHint =
                    document.createElement(
                        "div"
                    );
                multiSourceHint.className =
                    "input-source-hint";
                multiSourceHint.textContent =
                    incomingConnections.length > 1
                        ? `This input receives ${incomingConnections.length} values as an array in connection order.`
                        : "Add another source if this input should receive multiple values.";

                const manualValue =
                    document.createElement(
                        "input"
                    );
                manualValue.type = "text";
                manualValue.value =
                    input.manualValue !== undefined
                        ? input.manualValue
                        : "";
                manualValue.placeholder =
                    `Manual ${this.getPortDataType(input)} value`;
                manualValue.disabled =
                    incomingConnections.length > 0;

                manualValue.addEventListener(
                    "change",
                    () => {
                        if (
                            manualValue.value ===
                            String(
                                input.manualValue ?? ""
                            )
                        ) {
                            return;
                        }

                        this.recordHistoryState();
                        input.manualValue =
                            manualValue.value;

                        if (
                            this.getIncomingConnections(
                                widget,
                                input.id
                            ).length === 0
                        ) {
                            try {
                                input.value =
                                    this.coerceValueForPort(
                                        manualValue.value,
                                        input
                                    );
                            } catch (error) {
                                input.value =
                                    manualValue.value;
                            }
                        }

                        widget.refreshContent();
                        this.showWidgetProperties(
                            widget
                        );
                        this.scheduleSave();
                    }
                );

                const cardMeta =
                    document.createElement(
                        "div"
                    );
                cardMeta.className =
                    "io-card-meta";

                const requiredLabel =
                    document.createElement(
                        "label"
                    );
                requiredLabel.className =
                    "inline-check-label";

                const requiredCheckbox =
                    document.createElement(
                        "input"
                    );
                requiredCheckbox.type =
                    "checkbox";
                requiredCheckbox.checked =
                    input.required !== false;

                requiredCheckbox.addEventListener(
                    "change",
                    () => {
                        this.recordHistoryState();
                        input.required =
                            requiredCheckbox.checked;
                        this.scheduleSave();
                    }
                );

                requiredLabel.appendChild(
                    requiredCheckbox
                );
                requiredLabel.appendChild(
                    document.createTextNode(
                        " Required"
                    )
                );

                const currentValue =
                    document.createElement(
                        "span"
                    );
                currentValue.className =
                    "io-current-value";
                currentValue.textContent =
                    `Current: ${Widget.formatValue(input.value)}`;

                cardMeta.appendChild(
                    requiredLabel
                );
                cardMeta.appendChild(
                    currentValue
                );

                const removeButton =
                    document.createElement(
                        "button"
                    );
                removeButton.type = "button";
                removeButton.className =
                    "io-remove-button";
                removeButton.textContent =
                    "Remove Input";

                removeButton.addEventListener(
                    "click",
                    () => {
                        this.removeWidgetInput(
                            widget,
                            input.id
                        );
                    }
                );

                card.appendChild(nameInput);
                card.appendChild(typeField);
                card.appendChild(sourceSelect);
                card.appendChild(connectedSources);
                card.appendChild(multiSourceHint);
                card.appendChild(manualValue);
                card.appendChild(cardMeta);

                if (inputMissingRequiredValue) {
                    const issue =
                        document.createElement(
                            "div"
                        );
                    issue.className =
                        "io-validation-message";
                    issue.textContent =
                        "Required input needs at least one source or a manual value.";
                    card.appendChild(issue);
                }

                if (incompatibleIncoming.length > 0) {
                    const issue =
                        document.createElement(
                            "div"
                        );
                    issue.className =
                        "io-validation-message io-type-error";
                    issue.textContent =
                        `${incompatibleIncoming.length} connected source${incompatibleIncoming.length === 1 ? " is" : "s are"} incompatible with ${this.getPortDataType(input)}.`;
                    card.appendChild(issue);
                }

                if (manualTypeError) {
                    const issue =
                        document.createElement(
                            "div"
                        );
                    issue.className =
                        "io-validation-message io-type-error";
                    issue.textContent =
                        manualTypeError;
                    card.appendChild(issue);
                }

                card.appendChild(removeButton);
                inputsSection.body.appendChild(
                    card
                );
            }
        );

        const addInputButton =
            document.createElement("button");
        addInputButton.type = "button";
        addInputButton.className =
            "io-add-button";
        addInputButton.textContent =
            "+ Add Input";
        addInputButton.addEventListener(
            "click",
            () => {
                this.addWidgetInput(widget);
            }
        );

        inputsSection.body.appendChild(
            addInputButton
        );
        this.propertiesPanelContent.appendChild(
            inputsSection.section
        );


        /* =============================
         * Outputs
         * ============================= */
        const outputsSection =
            this.createPropertiesSection(
                "Outputs",
                "Outputs can feed any number of downstream inputs. Start-node values can be entered here directly."
            );
        outputsSection.section.dataset.tour = "properties-outputs";

        widget.outputs.forEach(
            (output) => {
                const card =
                    document.createElement(
                        "div"
                    );
                card.className =
                    "io-property-card output-property-card";

                const nameInput =
                    document.createElement(
                        "input"
                    );
                nameInput.type = "text";
                nameInput.value = output.name;
                nameInput.placeholder = "Output name";

                nameInput.addEventListener(
                    "change",
                    () => {
                        const nextName =
                            nameInput.value.trim();

                        if (
                            nextName === "" ||
                            nextName === output.name
                        ) {
                            nameInput.value =
                                output.name;
                            return;
                        }

                        this.recordHistoryState();
                        output.name = nextName;
                        widget.refreshContent();
                        this.showWidgetProperties(
                            widget
                        );
                        this.scheduleSave();
                    }
                );

                const typeField =
                    document.createElement(
                        "div"
                    );
                typeField.className =
                    "io-type-field";

                const typeFieldLabel =
                    document.createElement(
                        "span"
                    );
                typeFieldLabel.className =
                    "io-type-label";
                typeFieldLabel.textContent =
                    "Data type";

                const dataTypeSelect =
                    document.createElement(
                        "select"
                    );
                dataTypeSelect.className =
                    "io-data-type-select";

                Widget.getDataTypes().forEach(
                    (dataType) => {
                        const option =
                            document.createElement(
                                "option"
                            );
                        option.value = dataType;
                        option.textContent = dataType;
                        dataTypeSelect.appendChild(
                            option
                        );
                    }
                );

                dataTypeSelect.value =
                    this.getPortDataType(
                        output
                    );

                dataTypeSelect.addEventListener(
                    "change",
                    () => {
                        const nextType =
                            Widget.normalizeDataType(
                                dataTypeSelect.value
                            );

                        if (
                            nextType ===
                            this.getPortDataType(
                                output
                            )
                        ) {
                            return;
                        }

                        this.recordHistoryState();
                        output.dataType = nextType;

                        if (
                            String(
                                output.value ?? ""
                            ).trim() !== ""
                        ) {
                            try {
                                output.value =
                                    this.coerceValueForPort(
                                        output.value,
                                        output
                                    );
                            } catch (error) {
                                // Keep raw value visible; validation will flag it.
                            }
                        }

                        widget.refreshContent();
                        this.refreshAllConnectionTypeStates();
                        this.showWidgetProperties(
                            widget
                        );
                        this.scheduleSave();
                    }
                );

                typeField.appendChild(
                    typeFieldLabel
                );
                typeField.appendChild(
                    dataTypeSelect
                );

                const valueInput =
                    document.createElement(
                        "input"
                    );
                valueInput.type = "text";
                valueInput.value =
                    output.value !== undefined
                        ? output.value
                        : "";
                valueInput.placeholder =
                    widget.type === "Start"
                        ? "Starting output value"
                        : "Initial / current value";

                valueInput.addEventListener(
                    "change",
                    () => {
                        if (
                            valueInput.value ===
                            String(output.value ?? "")
                        ) {
                            return;
                        }

                        this.recordHistoryState();

                        try {
                            output.value =
                                this.coerceValueForPort(
                                    valueInput.value,
                                    output
                                );
                        } catch (error) {
                            output.value =
                                valueInput.value;
                        }

                        widget.refreshContent();
                        this.propagateOutputValue(
                            widget,
                            output.id
                        );
                        this.scheduleSave();
                    }
                );

                const outputMeta =
                    document.createElement(
                        "div"
                    );
                outputMeta.className =
                    "io-card-meta";

                const connectionCount =
                    this.getOutgoingConnections(
                        widget,
                        output.id
                    ).length;

                const incompatibleCount =
                    this.getOutgoingConnections(
                        widget,
                        output.id
                    ).filter(
                        (connection) =>
                            !this.getConnectionTypeCompatibility(
                                connection
                            ).compatible
                    ).length;

                const branchRole =
                    widget.type === "Decision"
                        ? (
                            output.id ===
                                widget.decisionTrueOutputId
                                ? "TRUE branch · "
                                : output.id ===
                                    widget.decisionFalseOutputId
                                    ? "FALSE branch · "
                                    : "Unassigned branch · "
                        )
                        : "";

                outputMeta.textContent =
                    `${branchRole}${this.getPortDataType(output)} · ${connectionCount} downstream connection${connectionCount === 1 ? "" : "s"}${incompatibleCount > 0 ? ` · ${incompatibleCount} incompatible` : ""}`;

                const removeButton =
                    document.createElement(
                        "button"
                    );
                removeButton.type = "button";
                removeButton.className =
                    "io-remove-button";
                removeButton.textContent =
                    "Remove";

                if (
                    widget.type === "Decision" &&
                    widget.outputs.length <= 2
                ) {
                    removeButton.disabled = true;
                    removeButton.title =
                        "Decision widgets require at least two outputs for TRUE and FALSE branches.";
                }

                removeButton.addEventListener(
                    "click",
                    () => {
                        this.removeWidgetOutput(
                            widget,
                            output.id
                        );
                    }
                );

                card.appendChild(nameInput);
                card.appendChild(typeField);
                card.appendChild(valueInput);
                card.appendChild(outputMeta);
                card.appendChild(removeButton);
                outputsSection.body.appendChild(
                    card
                );
            }
        );

        const addOutputButton =
            document.createElement("button");
        addOutputButton.type = "button";
        addOutputButton.className =
            "io-add-button";
        addOutputButton.textContent =
            "+ Add Output";
        addOutputButton.addEventListener(
            "click",
            () => {
                this.addWidgetOutput(widget);
            }
        );

        outputsSection.body.appendChild(
            addOutputButton
        );
        this.propertiesPanelContent.appendChild(
            outputsSection.section
        );


        /* =============================
         * Decision branching
         * ============================= */
        if (widget.type === "Decision") {
            widget.ensureDecisionConfiguration(
                true
            );

            decisionSection =
                this.createPropertiesSection(
                    "Decision Branching",
                    "Evaluate a Boolean condition and activate exactly one output branch. Downstream nodes on the other branch are skipped automatically."
                );
            decisionSection.section.dataset.tour = "properties-decision";

            const conditionRow =
                document.createElement(
                    "div"
                );
            conditionRow.className =
                "property-row";

            const conditionLabel =
                document.createElement(
                    "label"
                );
            conditionLabel.textContent =
                "Condition";

            const conditionInput =
                document.createElement(
                    "textarea"
                );
            conditionInput.className =
                "decision-condition-input";
            conditionInput.rows = 3;
            conditionInput.value =
                widget.decisionExpression ||
                "value";
            conditionInput.placeholder =
                "value > 10";
            conditionInput.title =
                "Use the same safe expression syntax as Expression nodes. Input names become variables.";

            conditionInput.addEventListener(
                "change",
                () => {
                    const nextExpression =
                        conditionInput.value.trim();

                    if (
                        nextExpression ===
                        widget.decisionExpression
                    ) {
                        return;
                    }

                    this.recordHistoryState();
                    widget.decisionExpression =
                        nextExpression;
                    widget.lastDecisionResult =
                        null;
                    widget.refreshContent();
                    this.clearBranchExecutionState();
                    this.scheduleSave();
                }
            );

            conditionRow.appendChild(
                conditionLabel
            );
            conditionRow.appendChild(
                conditionInput
            );

            const branchGrid =
                document.createElement(
                    "div"
                );
            branchGrid.className =
                "decision-branch-grid";

            const createBranchSelector =
                (
                    labelText,
                    role,
                    currentOutputId,
                    otherOutputId
                ) => {
                    const field =
                        document.createElement(
                            "div"
                        );
                    field.className =
                        `decision-branch-field decision-${role}-field`;

                    const label =
                        document.createElement(
                            "label"
                        );
                    label.textContent =
                        labelText;

                    const select =
                        document.createElement(
                            "select"
                        );

                    widget.outputs.forEach(
                        (output) => {
                            const option =
                                document.createElement(
                                    "option"
                                );
                            option.value =
                                output.id;
                            option.textContent =
                                `${output.name} [${this.getPortDataType(output)}]`;
                            option.disabled =
                                output.id ===
                                    otherOutputId;
                            select.appendChild(
                                option
                            );
                        }
                    );

                    select.value =
                        currentOutputId || "";

                    select.addEventListener(
                        "change",
                        () => {
                            this.recordHistoryState();

                            if (role === "true") {
                                widget.decisionTrueOutputId =
                                    select.value;
                            } else {
                                widget.decisionFalseOutputId =
                                    select.value;
                            }

                            widget.lastDecisionResult =
                                null;
                            widget.ensureDecisionConfiguration(
                                false
                            );
                            widget.refreshContent();
                            this.clearBranchExecutionState();
                            this.showWidgetProperties(
                                widget
                            );
                            this.scheduleSave();
                        }
                    );

                    field.appendChild(label);
                    field.appendChild(select);
                    return field;
                };

            branchGrid.appendChild(
                createBranchSelector(
                    "TRUE output",
                    "true",
                    widget.decisionTrueOutputId,
                    widget.decisionFalseOutputId
                )
            );

            branchGrid.appendChild(
                createBranchSelector(
                    "FALSE output",
                    "false",
                    widget.decisionFalseOutputId,
                    widget.decisionTrueOutputId
                )
            );

            const payloadRow =
                document.createElement(
                    "div"
                );
            payloadRow.className =
                "property-row";

            const payloadLabel =
                document.createElement(
                    "label"
                );
            payloadLabel.textContent =
                "Value sent down selected branch";

            const payloadSelect =
                document.createElement(
                    "select"
                );

            [
                [
                    "first-input",
                    "First input value"
                ],
                [
                    "condition-result",
                    "Boolean condition result"
                ],
                [
                    "input-object",
                    "All named inputs as JSON object"
                ]
            ].forEach(
                ([value, label]) => {
                    const option =
                        document.createElement(
                            "option"
                        );
                    option.value = value;
                    option.textContent = label;
                    payloadSelect.appendChild(
                        option
                    );
                }
            );

            payloadSelect.value =
                widget.decisionPayloadMode ||
                "first-input";

            payloadSelect.addEventListener(
                "change",
                () => {
                    if (
                        payloadSelect.value ===
                        widget.decisionPayloadMode
                    ) {
                        return;
                    }

                    this.recordHistoryState();
                    widget.decisionPayloadMode =
                        payloadSelect.value;
                    widget.lastDecisionResult =
                        null;
                    widget.refreshContent();
                    this.clearBranchExecutionState();
                    this.scheduleSave();
                }
            );

            payloadRow.appendChild(
                payloadLabel
            );
            payloadRow.appendChild(
                payloadSelect
            );

            const currentResult =
                document.createElement(
                    "div"
                );
            currentResult.className =
                "decision-current-result";

            if (
                typeof widget.lastDecisionResult ===
                    "boolean"
            ) {
                const selectedOutput =
                    widget.getDecisionSelectedOutput();

                currentResult.classList.add(
                    widget.lastDecisionResult
                        ? "result-true"
                        : "result-false"
                );

                currentResult.textContent =
                    `Last result: ${widget.lastDecisionResult ? "TRUE" : "FALSE"}` +
                    `${selectedOutput ? ` → ${selectedOutput.name}` : ""}`;
            } else {
                currentResult.textContent =
                    "Last result: not evaluated yet";
            }

            const testButton =
                document.createElement(
                    "button"
                );
            testButton.type = "button";
            testButton.className =
                "decision-test-button";
            testButton.textContent =
                "Test Condition With Current Inputs";

            testButton.addEventListener(
                "click",
                async () => {
                    try {
                        widget.inputs.forEach(
                            (input) => {
                                this.refreshInputValueFromConnections(
                                    widget,
                                    input.id
                                );
                            }
                        );

                        const context =
                            this.buildInputContext(
                                widget
                            );

                        const rawResult =
                            this.safeEvaluateExpression(
                                widget.decisionExpression ||
                                    "value",
                                context
                            );

                        const result =
                            Boolean(rawResult);

                        await this.showMessageDialog({
                            title: "Decision Test",
                            message:
                                `Condition: ${widget.decisionExpression || "value"}\n\nResult: ${result ? "TRUE" : "FALSE"}\nBranch: ${result ? (widget.getDecisionTrueOutput()?.name || "TRUE output") : (widget.getDecisionFalseOutput()?.name || "FALSE output")}`,
                            tone:
                                result
                                    ? "success"
                                    : "info",
                            confirmLabel: "Close"
                        });
                    } catch (error) {
                        await this.showMessageDialog({
                            title: "Decision Condition Error",
                            message: error.message,
                            tone: "error",
                            confirmLabel: "Close"
                        });
                    }
                }
            );

            decisionSection.body.appendChild(
                conditionRow
            );
            decisionSection.body.appendChild(
                branchGrid
            );
            decisionSection.body.appendChild(
                payloadRow
            );
            decisionSection.body.appendChild(
                currentResult
            );
            decisionSection.body.appendChild(
                testButton
            );

            this.propertiesPanelContent.appendChild(
                decisionSection.section
            );
        }


        /* =============================
         * Script / transformation
         * ============================= */
        const scriptSection =
            this.createPropertiesSection(
                "Script",
                "Runs in the browser-safe workflow simulator. Bash, Python, and JavaScript syntax is interpreted locally; no operating-system commands are executed."
            );
        scriptSection.section.dataset.tour = "properties-script";

        if (widget.type === "Decision") {
            scriptSection.section.hidden = true;
        }

        const languageRow =
            document.createElement("div");
        languageRow.className = "property-row";

        const languageLabel =
            document.createElement("label");
        languageLabel.textContent = "Language";

        const languageSelect =
            document.createElement("select");

        [
            "Pass-through",
            "Expression",
            "Bash",
            "Python",
            "JavaScript"
        ].forEach((language) => {
            const option =
                document.createElement(
                    "option"
                );
            option.value = language;
            option.textContent = language;
            languageSelect.appendChild(option);
        });

        languageSelect.value =
            widget.language ||
            "Pass-through";

        languageSelect.addEventListener(
            "change",
            () => {
                if (
                    languageSelect.value ===
                    widget.language
                ) {
                    return;
                }

                this.recordHistoryState();
                widget.language =
                    languageSelect.value;
                this.showWidgetProperties(
                    widget
                );
                this.scheduleSave();
            }
        );

        languageRow.appendChild(
            languageLabel
        );
        languageRow.appendChild(
            languageSelect
        );

        const sourceRow =
            document.createElement("div");
        sourceRow.className = "property-row";

        const sourceLabel =
            document.createElement("label");
        sourceLabel.textContent = "Source";

        const sourceInput =
            document.createElement("textarea");
        sourceInput.className =
            "script-source-input";
        sourceInput.value =
            widget.source || "";
        sourceInput.disabled =
            widget.language ===
            "Pass-through";

        const placeholders = {
            "Pass-through":
                "The first input is copied to the first output.",
            "Expression":
                "A + B",
            "Bash":
                "sleep 1\necho $value",
            "Python":
                "time.sleep(1)\nprint(value)",
            "JavaScript":
                "return value + 1"
        };

        sourceInput.placeholder =
            placeholders[widget.language] ||
            "Enter source";

        sourceInput.addEventListener(
            "change",
            () => {
                if (
                    sourceInput.value ===
                    widget.source
                ) {
                    return;
                }

                this.recordHistoryState();
                widget.source =
                    sourceInput.value;
                this.scheduleSave();
            }
        );

        sourceRow.appendChild(sourceLabel);
        sourceRow.appendChild(sourceInput);

        const delayRow =
            document.createElement("div");
        delayRow.className = "property-row";

        const delayLabel =
            document.createElement("label");
        delayLabel.textContent =
            "Base execution delay (ms)";

        const delayInput =
            document.createElement("input");
        delayInput.type = "number";
        delayInput.min = "0";
        delayInput.max = "5000";
        delayInput.step = "50";
        delayInput.value =
            String(
                widget.executionDelayMs || 0
            );

        delayInput.addEventListener(
            "change",
            () => {
                const nextValue =
                    Math.max(
                        0,
                        Math.min(
                            5000,
                            Number(
                                delayInput.value
                            ) || 0
                        )
                    );

                if (
                    nextValue ===
                    widget.executionDelayMs
                ) {
                    return;
                }

                this.recordHistoryState();
                widget.executionDelayMs =
                    nextValue;
                delayInput.value =
                    String(nextValue);
                this.scheduleSave();
            }
        );

        delayRow.appendChild(delayLabel);
        delayRow.appendChild(delayInput);

        scriptSection.body.appendChild(
            languageRow
        );
        scriptSection.body.appendChild(
            sourceRow
        );
        scriptSection.body.appendChild(
            delayRow
        );
        this.propertiesPanelContent.appendChild(
            scriptSection.section
        );


        /* =============================
         * Status + performance
         * ============================= */
        const statusSection =
            this.createPropertiesSection(
                "Status & Performance"
            );
        statusSection.section.dataset.tour = "properties-status";

        const showStatusLabel =
            document.createElement("label");
        showStatusLabel.className =
            "status-checkbox-label";

        const showStatusCheckbox =
            document.createElement("input");
        showStatusCheckbox.type = "checkbox";
        showStatusCheckbox.checked =
            widget.showStatus;

        showStatusCheckbox.addEventListener(
            "change",
            () => {
                this.recordHistoryState();
                widget.showStatus =
                    showStatusCheckbox.checked;
                widget.updateStatusDisplay();
                this.scheduleSave();
            }
        );

        showStatusLabel.appendChild(
            showStatusCheckbox
        );
        showStatusLabel.appendChild(
            document.createTextNode(
                " Show status indicator on widget"
            )
        );

        const metricsGrid =
            document.createElement("div");
        metricsGrid.className =
            "property-metrics-grid";

        const metricValues = [
            ["Status", widget.status],
            ["Runtime", `${Math.round(widget.runtimeMs)} ms`],
            ["Memory", `${widget.memoryKb.toFixed(1)} KB`],
            ["Inputs", String(widget.inputs.length)],
            ["Outputs", String(widget.outputs.length)]
        ];

        if (widget.type === "Decision") {
            metricValues.push([
                "Branch",
                typeof widget.lastDecisionResult ===
                    "boolean"
                    ? (
                        widget.lastDecisionResult
                            ? "TRUE"
                            : "FALSE"
                    )
                    : "Not evaluated"
            ]);
        }

        metricValues.forEach(
            ([label, value]) => {
                const metric =
                    document.createElement(
                        "div"
                    );
                metric.className =
                    "property-metric";

                const metricLabel =
                    document.createElement(
                        "span"
                    );
                metricLabel.className =
                    "property-metric-label";
                metricLabel.textContent = label;

                const metricValue =
                    document.createElement(
                        "strong"
                    );
                metricValue.textContent = value;

                metric.appendChild(
                    metricLabel
                );
                metric.appendChild(
                    metricValue
                );
                metricsGrid.appendChild(metric);
            }
        );

        if (widget.lastError) {
            const error =
                document.createElement("div");
            error.className =
                "property-error-message";
            error.textContent =
                widget.lastError;
            statusSection.body.appendChild(
                error
            );
        }

        statusSection.body.appendChild(
            metricsGrid
        );
        this.propertiesPanelContent.appendChild(
            statusSection.section
        );

        /* =============================
         * Display + notes (advanced)
         * ============================= */
        const advancedSection =
            this.createPropertiesSection(
                "Display & Notes",
                "Optional presentation and research-note settings."
            );
        advancedSection.section.dataset.tour =
            "properties-advanced";

        const notesRow =
            document.createElement("div");
        notesRow.className =
            "property-row";

        const notesLabel =
            document.createElement("label");
        notesLabel.textContent =
            "Research notes";

        const notesInput =
            document.createElement("textarea");
        notesInput.rows = 3;
        notesInput.placeholder =
            "Optional assumptions, context, or reminders";
        notesInput.value =
            widget.notes || "";

        notesInput.addEventListener(
            "change",
            () => {
                if (
                    notesInput.value ===
                    widget.notes
                ) {
                    return;
                }

                this.recordHistoryState();
                widget.notes =
                    notesInput.value;
                widget.refreshContent();
                this.scheduleSave();
            }
        );

        notesRow.appendChild(notesLabel);
        notesRow.appendChild(notesInput);

        advancedSection.body.appendChild(
            showStatusLabel
        );
        advancedSection.body.appendChild(
            notesRow
        );

        this.propertiesPanelContent.appendChild(
            advancedSection.section
        );


        /* =============================
         * Actions
         * ============================= */
        const actions =
            document.createElement("div");
        actions.className =
            "property-actions stacked-property-actions";
        actions.dataset.tour = "properties-actions";

        const validateButton =
            document.createElement("button");
        validateButton.type = "button";
        validateButton.textContent =
            "Validate Workflow";
        validateButton.addEventListener(
            "click",
            () => {
                this.validateWorkflow(true);
            }
        );

        const runSelectedButton =
            document.createElement("button");
        runSelectedButton.type = "button";
        runSelectedButton.className =
            "primary-property-button";
        runSelectedButton.textContent =
            "▷ Run This Node";
        runSelectedButton.title =
            "Run only this widget using its current input values";
        runSelectedButton.disabled =
            this.isWorkflowRunning;
        runSelectedButton.addEventListener(
            "click",
            () => {
                this.runSelectedWidget(widget);
            }
        );

        const runFromHereButton =
            document.createElement("button");
        runFromHereButton.type = "button";
        runFromHereButton.textContent =
            "↳ Run From Here";
        runFromHereButton.title =
            "Run this widget, then every downstream widget";
        runFromHereButton.disabled =
            this.isWorkflowRunning;
        runFromHereButton.addEventListener(
            "click",
            () => {
                this.runFromSelectedWidget(widget);
            }
        );

        const runButton =
            document.createElement("button");
        runButton.type = "button";
        runButton.textContent =
            "▶ Run Full Workflow";
        runButton.disabled =
            this.isWorkflowRunning;
        runButton.addEventListener(
            "click",
            () => {
                this.runWorkflow();
            }
        );

        const deleteButton =
            document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className =
            "delete-button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener(
            "click",
            () => {
                this.removeWidget(widget);
            }
        );

        actions.appendChild(validateButton);
        actions.appendChild(runSelectedButton);
        actions.appendChild(runFromHereButton);
        actions.appendChild(runButton);
        actions.appendChild(deleteButton);
        this.propertiesPanelContent.appendChild(
            actions
        );

        /*
         * Progressive disclosure: keep the common setup visible and put
         * execution/advanced controls one click deeper. Existing section
         * elements are moved into these groups, so their event listeners
         * and tutorial targets remain intact.
         */
        const basicGroup =
            this.createPropertyGroup(
                "basic",
                "Basic",
                "Name and identify this widget.",
                false
            );

        const ioGroup =
            this.createPropertyGroup(
                "io",
                "Inputs & Outputs",
                "Connect data and configure values.",
                false
            );

        const executionGroup =
            this.createPropertyGroup(
                "execution",
                "Execution",
                "Scripts, decisions, run state, and performance.",
                true
            );

        const advancedGroup =
            this.createPropertyGroup(
                "advanced",
                "Advanced",
                "Optional display and research-note settings.",
                true
            );

        basicGroup.body.appendChild(
            general.section
        );

        ioGroup.body.appendChild(
            inputsSection.section
        );
        ioGroup.body.appendChild(
            outputsSection.section
        );

        if (decisionSection) {
            executionGroup.body.appendChild(
                decisionSection.section
            );
        }
        executionGroup.body.appendChild(
            scriptSection.section
        );
        executionGroup.body.appendChild(
            statusSection.section
        );
        executionGroup.body.appendChild(
            actions
        );

        advancedGroup.body.appendChild(
            advancedSection.section
        );

        this.propertiesPanelContent.replaceChildren(
            basicGroup.section,
            ioGroup.section,
            executionGroup.section,
            advancedGroup.section
        );
    }

    showConnectionProperties(
        connection
    ) {
        if (
            !this.propertiesPanelContent ||
            !connection
        ) {
            return;
        }

        this.propertiesPanelContent.innerHTML = "";

        const section =
            this.createPropertiesSection(
                "Connection",
                "This edge transfers the source output value into the target input when the workflow runs."
            );

        const sourcePort =
            connection.sourceWidget
                .getOutputById(
                    connection.sourcePortId
                );

        const targetPort =
            connection.targetWidget
                .getInputById(
                    connection.targetPortId
                );

        const compatibility =
            this.getPortTypeCompatibility(
                sourcePort,
                targetPort
            );

        const details = [
            [
                "From",
                `${connection.sourceWidget.title} / ${sourcePort ? sourcePort.name : "output"}`
            ],
            [
                "Output type",
                sourcePort
                    ? this.getPortDataType(sourcePort)
                    : "Missing"
            ],
            [
                "To",
                `${connection.targetWidget.title} / ${targetPort ? targetPort.name : "input"}`
            ],
            [
                "Input type",
                targetPort
                    ? this.getPortDataType(targetPort)
                    : "Missing"
            ],
            [
                "Compatibility",
                compatibility.message
            ],
            [
                "Current value",
                Widget.formatValue(
                    connection.lastValue !== undefined
                        ? connection.lastValue
                        : sourcePort
                            ? sourcePort.value
                            : ""
                )
            ],
            [
                "Path state",
                this.getConnectionBranchState(
                    connection
                )
            ],
            [
                "Last transfer",
                connection.lastUpdatedAt
                    ? new Date(
                        connection.lastUpdatedAt
                    ).toLocaleTimeString()
                    : "Not transferred yet"
            ],
            [
                "Last run",
                connection.lastRunId
                    ? `Run #${connection.lastRunId}`
                    : "—"
            ]
        ];

        details.forEach(
            ([label, value]) => {
                const row =
                    document.createElement(
                        "div"
                    );
                row.className =
                    "property-row";

                const rowLabel =
                    document.createElement(
                        "label"
                    );
                rowLabel.textContent = label;

                const rowValue =
                    document.createElement(
                        "div"
                    );
                rowValue.className =
                    "property-readout";
                rowValue.textContent = value;

                row.appendChild(rowLabel);
                row.appendChild(rowValue);
                section.body.appendChild(row);
            }
        );

        this.propertiesPanelContent.appendChild(
            section.section
        );

        const actions =
            document.createElement("div");
        actions.className =
            "property-actions stacked-property-actions";

        const inspectButton =
            document.createElement("button");
        inspectButton.type = "button";
        inspectButton.textContent =
            "Preview Transferred Data";
        inspectButton.addEventListener(
            "click",
            () => {
                this.showDataPreview({
                    title: `${connection.sourceWidget.title} → ${connection.targetWidget.title}`,
                    value:
                        connection.lastValue !== undefined
                            ? connection.lastValue
                            : sourcePort
                                ? sourcePort.value
                                : "",
                    dataType:
                        sourcePort
                            ? this.getPortDataType(sourcePort)
                            : "Any",
                    subtitle:
                        connection.lastUpdatedAt
                            ? `updated ${new Date(connection.lastUpdatedAt).toLocaleTimeString()}`
                            : "not transferred yet"
                });
            }
        );

        const sourceButton =
            document.createElement("button");
        sourceButton.type = "button";
        sourceButton.textContent =
            "Select Source Widget";
        sourceButton.addEventListener(
            "click",
            () => {
                this.selectWidget(
                    connection.sourceWidget
                );
            }
        );

        const targetButton =
            document.createElement("button");
        targetButton.type = "button";
        targetButton.textContent =
            "Select Target Widget";
        targetButton.addEventListener(
            "click",
            () => {
                this.selectWidget(
                    connection.targetWidget
                );
            }
        );

        const deleteButton =
            document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className =
            "delete-button";
        deleteButton.textContent =
            "Delete Connection";
        deleteButton.addEventListener(
            "click",
            () => {
                this.removeConnection(
                    connection
                );
            }
        );

        actions.appendChild(inspectButton);
        actions.appendChild(sourceButton);
        actions.appendChild(targetButton);
        actions.appendChild(deleteButton);
        this.propertiesPanelContent.appendChild(
            actions
        );
    }

    syncViewMenuCheckboxes() {
        if (this.leftPanelViewCheckbox) {
            this.leftPanelViewCheckbox.checked =
                this.leftPanelVisible;
        }

        if (this.rightPanelViewCheckbox) {
            this.rightPanelViewCheckbox.checked =
                this.rightPanelVisible;
        }
    }

    togglePanel(side) {
        if (side === "left") {
            this.leftPanelVisible = !this.leftPanelVisible;

            this.leftPanel.classList.toggle(
                "hidden",
                !this.leftPanelVisible
            );

            this.leftResizer.classList.toggle(
                "hidden",
                !this.leftPanelVisible
            );

            this.mainArea.classList.toggle(
                "left-hidden",
                !this.leftPanelVisible
            );

            this.leftShowZone.classList.toggle(
                "hidden",
                this.leftPanelVisible
            );
        }

        if (side === "right") {
            this.rightPanelVisible =
                !this.rightPanelVisible;

            this.rightPanel.classList.toggle(
                "hidden",
                !this.rightPanelVisible
            );

            this.rightResizer.classList.toggle(
                "hidden",
                !this.rightPanelVisible
            );

            this.mainArea.classList.toggle(
                "right-hidden",
                !this.rightPanelVisible
            );

            this.rightShowZone.classList.toggle(
                "hidden",
                this.rightPanelVisible
            );
        }

        /*
         * Keep View-menu checkboxes synchronized even when
         * the user toggles a panel from its Hide/Show control.
         */
        this.syncViewMenuCheckboxes();

        this.scheduleSave();
    }

    handleWheel(event) {
        event.preventDefault();

        const viewportRect =
            this.workspaceContainer.getBoundingClientRect();

        const mouseX =
            event.clientX - viewportRect.left;

        const mouseY =
            event.clientY - viewportRect.top;

        /*
         * Find the workspace coordinate currently underneath
         * the mouse before changing the zoom.
         */
        const workspaceX =
            (mouseX - this.panX) / this.zoom;

        const workspaceY =
            (mouseY - this.panY) / this.zoom;

        if (event.deltaY < 0) {
            this.zoom += this.zoomStep;
        } else {
            this.zoom -= this.zoomStep;
        }

        this.zoom = Math.max(
            this.minimumZoom,
            Math.min(this.maximumZoom, this.zoom)
        );

        /*
         * Adjust translation so the same workspace location
         * remains underneath the mouse.
         */
        this.panX =
            mouseX - workspaceX * this.zoom;

        this.panY =
            mouseY - workspaceY * this.zoom;

        this.constrainPan();

        this.updateWorkspaceTransform();
        this.updateStats();

        this.scheduleSave();
    }

    updateWorkspaceTransform() {
        if (!this.workspace) {
            return;
        }

        this.workspace.style.transform =
            `translate(${this.panX}px, ${this.panY}px) ` +
            `scale(${this.zoom})`;

        if (this.zoomDisplay) {
            const percentage =
                Math.round(this.zoom * 100);

            this.zoomDisplay.textContent =
                `Zoom: ${percentage}%`;
        }

        this.updateWorkflowMap();
    }

    screenToWorkspace(clientX, clientY) {
        const viewportRect =
            this.workspaceContainer.getBoundingClientRect();

        const canvasX =
            clientX - viewportRect.left;

        const canvasY =
            clientY - viewportRect.top;

        return {
            x: (canvasX - this.panX) / this.zoom,
            y: (canvasY - this.panY) / this.zoom
        };
    }

    resetView() {
        this.centerWorkspace();
        this.updateStats();
        this.scheduleSave();
    }

    async createNewWorkflow() {
        const confirmed =
            await this.showConfirmDialog({
                title: "Create New Workflow",
                message:
                    "Create a new workflow? The current workflow will be cleared.",
                confirmLabel: "Create New",
                danger: true
            });

        if (!confirmed) {
            return;
        }

        if (
            this.widgets.length > 0 ||
            this.connections.length > 0
        ) {
            this.recordHistoryState();
        }

        this.clearWorkflow();

        this.nextWidgetNumber = 1;
        this.nextWidgetZIndex = 3;

        /*
         * A new workflow starts centered instead of at
         * the top-left corner.
         */
        this.centerWorkspace();
        this.updateStats();
        this.saveState();
    }

    clearWorkflow() {
        this.executionRunId += 1;
        this.isWorkflowRunning = false;
        this.isWorkflowPaused = false;
        this.currentExecutionMode = "idle";
        this.currentExecutionWidgetIds = new Set();
        this.currentExecutionLabel = "";
        this.currentRunningWidget = null;
        this.releaseWorkflowPauseWaiters();

        this.clearAllWidgetPeek();

        this.hoverPeekConnections = [];
        this.clearConnectionPeekVisuals();

        this.clearConnections();
        this.widgets.forEach((widget) => {
            if (widget.element) {
                widget.element.remove();
            }
        });

        this.widgets = [];
        this.selectedWidget = null;

        this.connections = [];

        this.selectedConnection = null;

        this.nextConnectionNumber = 1;

        this.nextWidgetZIndex = 3;

        this.connectionSourceWidget = null;
        this.connectionSourcePortId = null;
        this.connectionPreviewElement = null;

        this.connectionMoveHandler = null;
        this.connectionEndHandler = null;
        this.connectionCancelHandler = null;

        this.showNoSelectionMessage();
        this.updateStats();
        this.updateWorkflowMap();
    }

    updateStats() {
        if (!this.widgetCountElement) {
            return;
        }

        const widgetCount =
            this.widgets.length;

        const totalRuntime =
            this.widgets.reduce(
                (total, widget) =>
                    total +
                    (
                        Number(widget.runtimeMs) ||
                        0
                    ),
                0
            );

        const totalMemory =
            this.widgets.reduce(
                (total, widget) =>
                    total +
                    (
                        Number(widget.memoryKb) ||
                        0
                    ),
                0
            );

        this.widgetCountElement.textContent =
            `Widgets: ${widgetCount}`;

        this.runtimeElement.textContent =
            `Runtime: ${Math.round(totalRuntime)} ms`;

        this.spaceElement.textContent =
            `Memory: ${totalMemory.toFixed(1)} KB`;

        if (this.isWorkflowRunning) {
            const runState =
                this.isWorkflowPaused
                    ? "paused"
                    : "running";

            const modeLabel =
                this.currentExecutionLabel
                    ? ` · ${this.currentExecutionLabel}`
                    : "";

            this.positionElement.textContent =
                `Workflow: ${runState}${modeLabel}`;
        } else if (this.selectedWidget) {
            this.positionElement.textContent =
                `Selected: ${this.selectedWidget.title}`;
        } else if (this.selectedConnection) {
            const sourcePort =
                this.selectedConnection.sourceWidget
                    .getOutputById(
                        this.selectedConnection.sourcePortId
                    );

            const targetPort =
                this.selectedConnection.targetWidget
                    .getInputById(
                        this.selectedConnection.targetPortId
                    );

            this.positionElement.textContent =
                `Selected: ${this.selectedConnection.sourceWidget.title}` +
                ` / ${sourcePort ? sourcePort.name : "output"}` +
                ` → ${this.selectedConnection.targetWidget.title}` +
                ` / ${targetPort ? targetPort.name : "input"}`;
        } else {
            this.positionElement.textContent =
                `Zoom: ${Math.round(this.zoom * 100)}%`;
        }
    }

    updateWorkflowMap() {
        if (!this.workflowMapContent) {
            return;
        }

        this.workflowMapContent.innerHTML =
            "";

        const mapWidth =
            this.workflowMapContent
                .clientWidth || 198;

        const mapHeight =
            this.workflowMapContent
                .clientHeight || 112;

        const itemWidth = 16;
        const itemHeight = 10;

        /*
         * Calculate miniature widget positions once so
         * widget boxes and connection paths stay aligned.
         */
        const mapPositions =
            new Map();

        this.widgets.forEach(
            (widget) => {
                const rawX =
                    (
                        widget.x /
                        this.workspaceWidth
                    ) *
                    mapWidth;

                const rawY =
                    (
                        widget.y /
                        this.workspaceHeight
                    ) *
                    mapHeight;

                const left =
                    Math.max(
                        0,
                        Math.min(
                            mapWidth -
                                itemWidth,
                            rawX
                        )
                    );

                const top =
                    Math.max(
                        0,
                        Math.min(
                            mapHeight -
                                itemHeight,
                            rawY
                        )
                    );

                mapPositions.set(
                    widget,
                    {
                        left,
                        top,
                        right:
                            left +
                            itemWidth,
                        centerX:
                            left +
                            itemWidth / 2,
                        centerY:
                            top +
                            itemHeight / 2
                    }
                );
            }
        );

        if (this.widgets.length === 0) {
            const emptyMessage =
                document.createElement(
                    "div"
                );

            emptyMessage.className =
                "workflow-map-empty";

            emptyMessage.textContent =
                "No widgets";

            this.workflowMapContent
                .appendChild(
                    emptyMessage
                );
        } else {
            /*
             * Miniature workflow connections.
             */
            const svgNamespace =
                "http://www.w3.org/2000/svg";

            const mapConnections =
                document.createElementNS(
                    svgNamespace,
                    "svg"
                );

            mapConnections.classList.add(
                "workflow-map-connections"
            );

            mapConnections.setAttribute(
                "viewBox",
                `0 0 ${mapWidth} ${mapHeight}`
            );

            mapConnections.setAttribute(
                "width",
                String(mapWidth)
            );

            mapConnections.setAttribute(
                "height",
                String(mapHeight)
            );

            this.connections.forEach(
                (connection) => {
                    const source =
                        mapPositions.get(
                            connection
                                .sourceWidget
                        );

                    const target =
                        mapPositions.get(
                            connection
                                .targetWidget
                        );

                    if (
                        !source ||
                        !target
                    ) {
                        return;
                    }

                    const sourceX =
                        source.right;

                    const sourceY =
                        source.centerY;

                    const targetX =
                        target.left;

                    const targetY =
                        target.centerY;

                    const path =
                        document.createElementNS(
                            svgNamespace,
                            "path"
                        );

                    path.classList.add(
                        "workflow-map-connection"
                    );

                    if (
                        this.selectedConnection ===
                        connection
                    ) {
                        path.classList.add(
                            "selected"
                        );
                    }

                    const branchState =
                        this.getConnectionBranchState(
                            connection
                        );

                    if (branchState === "active") {
                        path.classList.add(
                            "branch-active"
                        );
                    } else if (
                        branchState === "inactive"
                    ) {
                        path.classList.add(
                            "branch-inactive"
                        );
                    }

                    const horizontalDistance =
                        Math.abs(
                            targetX -
                            sourceX
                        );

                    const curve =
                        Math.max(
                            6,
                            horizontalDistance *
                                0.4
                        );

                    let pathData;

                    if (
                        targetX >=
                        sourceX
                    ) {
                        pathData =
                            (
                                `M ${sourceX} ${sourceY} ` +
                                `C ${sourceX + curve} ${sourceY}, ` +
                                `${targetX - curve} ${targetY}, ` +
                                `${targetX} ${targetY}`
                            );
                    } else {
                        pathData =
                            (
                                `M ${sourceX} ${sourceY} ` +
                                `C ${sourceX + 8} ${sourceY}, ` +
                                `${targetX - 8} ${targetY}, ` +
                                `${targetX} ${targetY}`
                            );
                    }

                    path.setAttribute(
                        "d",
                        pathData
                    );

                    mapConnections
                        .appendChild(
                            path
                        );
                }
            );

            this.workflowMapContent
                .appendChild(
                    mapConnections
                );

            /*
             * Miniature widgets.
             */
            this.widgets.forEach(
                (widget) => {
                    const position =
                        mapPositions.get(
                            widget
                        );

                    const mapItem =
                        document.createElement(
                            "div"
                        );

                    mapItem.className =
                        "workflow-map-item";

                    if (
                        this.selectedWidget ===
                        widget
                    ) {
                        mapItem.classList.add(
                            "selected"
                        );
                    }

                    mapItem.title =
                        widget.title;

                    mapItem.style.left =
                        `${position.left}px`;

                    mapItem.style.top =
                        `${position.top}px`;

                    this.workflowMapContent
                        .appendChild(
                            mapItem
                        );
                }
            );
        }

        /*
         * Red rectangle representing the visible portion
         * of the main workspace.
         */
        const worldLeft =
            -this.panX /
            this.zoom;

        const worldTop =
            -this.panY /
            this.zoom;

        const visibleWorldWidth =
            this.workspaceContainer
                .clientWidth /
            this.zoom;

        const visibleWorldHeight =
            this.workspaceContainer
                .clientHeight /
            this.zoom;

        let viewportLeft =
            (
                worldLeft /
                this.workspaceWidth
            ) *
            mapWidth;

        let viewportTop =
            (
                worldTop /
                this.workspaceHeight
            ) *
            mapHeight;

        let viewportWidth =
            (
                visibleWorldWidth /
                this.workspaceWidth
            ) *
            mapWidth;

        let viewportHeight =
            (
                visibleWorldHeight /
                this.workspaceHeight
            ) *
            mapHeight;

        viewportWidth =
            Math.min(
                mapWidth,
                Math.max(
                    8,
                    viewportWidth
                )
            );

        viewportHeight =
            Math.min(
                mapHeight,
                Math.max(
                    8,
                    viewportHeight
                )
            );

        viewportLeft =
            Math.max(
                0,
                Math.min(
                    mapWidth -
                        viewportWidth,
                    viewportLeft
                )
            );

        viewportTop =
            Math.max(
                0,
                Math.min(
                    mapHeight -
                        viewportHeight,
                    viewportTop
                )
            );

        const viewport =
            document.createElement(
                "div"
            );

        viewport.className =
            "workflow-map-viewport";

        viewport.style.left =
            `${viewportLeft}px`;

        viewport.style.top =
            `${viewportTop}px`;

        viewport.style.width =
            `${viewportWidth}px`;

        viewport.style.height =
            `${viewportHeight}px`;

        this.workflowMapContent
            .appendChild(
                viewport
            );
    }

    createPanelShowZone(side) {
        const showZone = document.createElement("div");

        showZone.className =
            `panel-show-zone ${side}-show-zone hidden`;

        const showButton = document.createElement("button");
        showButton.className = "panel-show-button";
        showButton.textContent = "Show";

        showButton.addEventListener("click", () => {
            this.togglePanel(side);
        });

        showZone.appendChild(showButton);

        return showZone;
    }

    createPanelResizer(side) {
        const resizer = document.createElement("div");

        resizer.className =
            `panel-resizer ${side}-panel-resizer`;

        resizer.addEventListener(
            "pointerdown",
            (event) => {
                this.startPanelResize(side, event);
            }
        );

        return resizer;
    }

    startPanelResize(side, event) {
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();

        const resizer = event.currentTarget;

        const startX = event.clientX;

        const startWidth =
            side === "left"
                ? this.leftPanelWidth
                : this.rightPanelWidth;

        resizer.setPointerCapture(event.pointerId);

        const resize = (moveEvent) => {
            const movementX =
                moveEvent.clientX - startX;

            if (side === "left") {
                this.leftPanelWidth =
                    startWidth + movementX;

                this.leftPanelWidth = Math.max(
                    160,
                    Math.min(500, this.leftPanelWidth)
                );
            } else {
                this.rightPanelWidth =
                    startWidth - movementX;

                this.rightPanelWidth = Math.max(
                    160,
                    Math.min(500, this.rightPanelWidth)
                );
            }

            this.applyPanelWidths();
        };

        const stopResize = () => {
            resizer.removeEventListener(
                "pointermove",
                resize
            );

            resizer.removeEventListener(
                "pointerup",
                stopResize
            );

            resizer.removeEventListener(
                "pointercancel",
                stopResize
            );

            this.scheduleSave();
        };

        resizer.addEventListener(
            "pointermove",
            resize
        );

        resizer.addEventListener(
            "pointerup",
            stopResize
        );

        resizer.addEventListener(
            "pointercancel",
            stopResize
        );
    }

    applyPanelWidths() {
        this.mainArea.style.setProperty(
            "--left-panel-width",
            `${this.leftPanelWidth}px`
        );

        this.mainArea.style.setProperty(
            "--right-panel-width",
            `${this.rightPanelWidth}px`
        );
    }

    startPanning(event) {
        /*
        * Only allow the middle mouse button.
        */
        if (event.button !== 1) {
            return;
        }

        event.preventDefault();

        this.isPanning = true;

        /*
        * Record where the pointer started.
        */
        this.panStartX = event.clientX;
        this.panStartY = event.clientY;

        /*
        * Record the current workspace translation.
        */
        this.panStartOffsetX = this.panX;
        this.panStartOffsetY = this.panY;

        /*
        * Change the cursor while panning.
        */
        this.workspaceContainer.classList.add(
            "panning"
        );

        /*
        * Keep receiving pointer events even if the mouse
        * leaves the workspace while dragging.
        */
        this.workspaceContainer.setPointerCapture(
            event.pointerId
        );
    }

    panCanvas(event) {
        if (!this.isPanning) {
            return;
        }

        const movementX =
            event.clientX - this.panStartX;

        const movementY =
            event.clientY - this.panStartY;

        this.panX =
            this.panStartOffsetX + movementX;

        this.panY =
            this.panStartOffsetY + movementY;

        this.constrainPan();

        this.updateWorkspaceTransform();
    }

    stopPanning(event) {
        if (!this.isPanning) {
            return;
        }

        this.isPanning = false;

        this.workspaceContainer.classList.remove(
            "panning"
        );

        if (
            this.workspaceContainer.hasPointerCapture(
                event.pointerId
            )
        ) {
            this.workspaceContainer.releasePointerCapture(
                event.pointerId
            );
        }

        this.scheduleSave();
    }

    startWorkflowMapDrag(event) {
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();

        this.isWorkflowMapDragging =
            true;

        this.workflowMapPointerId =
            event.pointerId;

        /*
         * Grabbing the red viewport should not make it jump.
         * Preserve the exact point where the user grabbed it.
         */
        const viewportElement =
            event.target.closest
                ? event.target.closest(
                    ".workflow-map-viewport"
                )
                : null;

        if (viewportElement) {
            const viewportRect =
                viewportElement
                    .getBoundingClientRect();

            const viewportCenterX =
                viewportRect.left +
                viewportRect.width / 2;

            const viewportCenterY =
                viewportRect.top +
                viewportRect.height / 2;

            this.workflowMapDragOffsetX =
                event.clientX -
                viewportCenterX;

            this.workflowMapDragOffsetY =
                event.clientY -
                viewportCenterY;
        } else {
            /*
             * Clicking outside the viewport jumps directly
             * to that point and can immediately continue as
             * a click-and-hold drag.
             */
            this.workflowMapDragOffsetX = 0;
            this.workflowMapDragOffsetY = 0;
        }

        this.workflowMapContent
            .setPointerCapture(
                event.pointerId
            );

        this.workflowMapContent
            .classList.add(
                "map-dragging"
            );

        this.moveViewFromWorkflowMap(
            event.clientX,
            event.clientY
        );
    }

    dragWorkflowMap(event) {
        if (
            !this.isWorkflowMapDragging
        ) {
            return;
        }

        if (
            event.pointerId !==
            this.workflowMapPointerId
        ) {
            return;
        }

        this.moveViewFromWorkflowMap(
            event.clientX,
            event.clientY
        );
    }

    moveViewFromWorkflowMap(
        clientX,
        clientY
    ) {
        if (!this.workflowMapContent) {
            return;
        }

        const mapRect =
            this.workflowMapContent
                .getBoundingClientRect();

        let mapX =
            clientX -
            this.workflowMapDragOffsetX -
            mapRect.left;

        let mapY =
            clientY -
            this.workflowMapDragOffsetY -
            mapRect.top;

        mapX =
            Math.max(
                0,
                Math.min(
                    mapRect.width,
                    mapX
                )
            );

        mapY =
            Math.max(
                0,
                Math.min(
                    mapRect.height,
                    mapY
                )
            );

        const worldCenterX =
            (
                mapX /
                mapRect.width
            ) *
            this.workspaceWidth;

        const worldCenterY =
            (
                mapY /
                mapRect.height
            ) *
            this.workspaceHeight;

        this.panX =
            this.workspaceContainer
                .clientWidth / 2 -
            worldCenterX *
                this.zoom;

        this.panY =
            this.workspaceContainer
                .clientHeight / 2 -
            worldCenterY *
                this.zoom;

        this.constrainPan();

        /*
         * updateWorkspaceTransform() also refreshes the
         * minimap, so the red viewport follows live.
         */
        this.updateWorkspaceTransform();
    }

    stopWorkflowMapDrag(event) {
        if (
            !this.isWorkflowMapDragging
        ) {
            return;
        }

        if (
            event.pointerId !==
            this.workflowMapPointerId
        ) {
            return;
        }

        this.isWorkflowMapDragging =
            false;

        this.workflowMapContent
            .classList.remove(
                "map-dragging"
            );

        if (
            this.workflowMapContent
                .hasPointerCapture(
                    event.pointerId
                )
        ) {
            this.workflowMapContent
                .releasePointerCapture(
                    event.pointerId
                );
        }

        this.workflowMapPointerId =
            null;

        this.workflowMapDragOffsetX = 0;
        this.workflowMapDragOffsetY = 0;

        this.scheduleSave();
    }

    centerWorkspace() {
        this.zoom = 1;

        const viewportWidth =
            this.workspaceContainer.clientWidth;

        const viewportHeight =
            this.workspaceContainer.clientHeight;

        const centerX =
            this.workspaceWidth / 2;

        const centerY =
            this.workspaceHeight / 2;

        this.panX =
            viewportWidth / 2 -
            centerX * this.zoom;

        this.panY =
            viewportHeight / 2 -
            centerY * this.zoom;

        this.updateWorkspaceTransform();
    }

    constrainPan() {
        const viewportWidth =
            this.workspaceContainer.clientWidth;

        const viewportHeight =
            this.workspaceContainer.clientHeight;

        const scaledWidth =
            this.workspaceWidth * this.zoom;

        const scaledHeight =
            this.workspaceHeight * this.zoom;

        /*
        * Horizontal constraint
        */
        if (scaledWidth <= viewportWidth) {
            this.panX =
                (viewportWidth - scaledWidth) / 2;
        } else {
            const minimumPanX =
                viewportWidth - scaledWidth;

            const maximumPanX = 0;

            this.panX = Math.max(
                minimumPanX,
                Math.min(maximumPanX, this.panX)
            );
        }

        /*
        * Vertical constraint
        */
        if (scaledHeight <= viewportHeight) {
            this.panY =
                (viewportHeight - scaledHeight) / 2;
        } else {
            const minimumPanY =
                viewportHeight - scaledHeight;

            const maximumPanY = 0;

            this.panY = Math.max(
                minimumPanY,
                Math.min(maximumPanY, this.panY)
            );
        }
    }

    importWorkflow(file) {
        const reader = new FileReader();

        reader.addEventListener(
            "load",
            async () => {
                try {
                    const workflowData =
                        JSON.parse(
                            reader.result
                        );

                    if (
                        !workflowData ||
                        !Array.isArray(
                            workflowData.widgets
                        )
                    ) {
                        throw new Error(
                            "Invalid workflow file"
                        );
                    }

                    /*
                    * Only warn if there is currently
                    * something that could be lost.
                    */
                    if (
                        this.widgets.length > 0
                    ) {
                        const confirmed =
                            await this.showConfirmDialog({
                                title: "Replace Current Workflow?",
                                message:
                                    "Importing this workflow will replace your current workflow.",
                                confirmLabel: "Import & Replace",
                                danger: true
                            });

                        if (!confirmed) {
                            return;
                        }
                    }

                    this.recordHistoryState();

                    this.applyWorkflowData(
                        workflowData
                    );
                } catch (error) {
                    console.error(error);

                    await this.showMessageDialog({
                        title: "Import Failed",
                        message:
                            "This is not a valid workflow JSON file.",
                        tone: "error"
                    });
                }
            }
        );

        reader.readAsText(file);
    }

    applyWorkflowData(workflowData) {
        this.clearWorkflow();

        workflowData.widgets.forEach(
            (widgetData) => {
                if (
                    typeof widgetData.x !== "number" ||
                    typeof widgetData.y !== "number"
                ) {
                    throw new Error(
                        "Invalid widget coordinates"
                    );
                }

                const widget = new Widget(
                    this,
                    String(widgetData.id),
                    String(widgetData.title),
                    String(
                        widgetData.type ||
                        "Process"
                    ),
                    widgetData.x,
                    widgetData.y
                );

                if (
                    typeof widgetData.zIndex ===
                    "number"
                ) {
                    widget.zIndex =
                        widgetData.zIndex;
                }

                widget.applyJSON(
                    widgetData
                );

                this.addWidget(widget);
            }
        );

        /*
        * Recreate saved workflow connections
        * after all widgets exist.
        */
        if (
            Array.isArray(
                workflowData.connections
            )
        ) {
            workflowData.connections.forEach(
                (connectionData) => {

                    const sourceWidget =
                        this.widgets.find(
                            (widget) =>
                                widget.id ===
                                connectionData
                                    .sourceWidgetId
                        );

                    const targetWidget =
                        this.widgets.find(
                            (widget) =>
                                widget.id ===
                                connectionData
                                    .targetWidgetId
                        );

                    /*
                    * Ignore invalid connections instead
                    * of crashing the whole workflow.
                    */
                    if (
                        sourceWidget &&
                        targetWidget &&
                        sourceWidget !==
                            targetWidget
                    ) {
                        this.addConnection(
                            sourceWidget,
                            targetWidget,
                            connectionData.sourcePortId || null,
                            connectionData.targetPortId || null
                        );
                    }
                }
            );
        }

        if (
            typeof workflowData.zoom ===
            "number"
        ) {
            this.zoom =
                workflowData.zoom;
        }

        if (
            typeof workflowData.panX ===
            "number"
        ) {
            this.panX =
                workflowData.panX;
        }

        if (
            typeof workflowData.panY ===
            "number"
        ) {
            this.panY =
                workflowData.panY;
        }

        if (
            typeof workflowData.leftPanelWidth ===
            "number"
        ) {
            this.leftPanelWidth =
                workflowData.leftPanelWidth;
        }

        if (
            typeof workflowData.rightPanelWidth ===
            "number"
        ) {
            this.rightPanelWidth =
                workflowData.rightPanelWidth;
        }

        /*
        * Avoid duplicate widget IDs after importing.
        */
        const widgetNumbers =
            this.widgets
                .map((widget) => {
                    const match =
                        widget.id.match(
                            /^widget-(\d+)$/
                        );

                    return match
                        ? Number(match[1])
                        : 0;
                });

        this.nextWidgetNumber =
            Math.max(
                0,
                ...widgetNumbers
            ) + 1;

        this.applyPanelWidths();
        this.updateWorkspaceTransform();
        this.updateStats();
        this.updateWorkflowMap();

        this.scheduleSave();
    }

    maybeStartFirstRunTutorial() {
        if (this.tutorialActive) return;

        let seen = false;
        try {
            seen = localStorage.getItem(this.tutorialStorageKey) === "true";
        } catch (error) {}

        if (seen) return;

        try {
            localStorage.setItem(this.tutorialStorageKey, "true");
        } catch (error) {}

        this.startInterfaceTutorial();
    }

    startInterfaceTutorial(
        { force = false, section = "full" } = {}
    ) {
        if (this.tutorialActive || this.activeDialog) return;

        if (force) {
            try {
                localStorage.setItem(this.tutorialStorageKey, "true");
            } catch (error) {}
        }

        this.hideContextMenu();
        this.tutorialPreviousUiState = {
            leftPanelVisible: this.leftPanelVisible,
            rightPanelVisible: this.rightPanelVisible,
            executionConsoleOpen: this.executionConsoleOpen,
            selectedWidgetId: this.selectedWidget?.id || null,
            selectedConnectionId: this.selectedConnection?.id || null
        };

        this.tutorialActive = true;
        this.tutorialStepIndex = 0;
        this.tutorialSectionId = section;
        this.tutorialSectionLabel =
            this.getTutorialSectionLabel(section);
        this.tutorialSteps =
            this.getInterfaceTutorialSteps(section);

        if (this.tutorialSteps.length === 0) {
            this.tutorialSectionId = "full";
            this.tutorialSectionLabel = "Full Tutorial";
            this.tutorialSteps =
                this.getInterfaceTutorialSteps("full");
        }

        const layer = document.createElement("div");
        layer.className = "interface-tutorial-layer";

        const highlight = document.createElement("div");
        highlight.className = "interface-tutorial-highlight";

        const card = document.createElement("section");
        card.className = "interface-tutorial-card";
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-modal", "true");
        card.setAttribute("aria-label", "Workflow Builder tutorial");

        layer.appendChild(highlight);
        layer.appendChild(card);
        document.body.appendChild(layer);

        this.tutorialLayer = layer;
        this.tutorialHighlight = highlight;
        this.tutorialCard = card;
        this.tutorialResizeHandler = () => this.positionTutorialStep();
        window.addEventListener("resize", this.tutorialResizeHandler);
        this.showTutorialStep();
    }

    getTutorialSectionLabel(sectionId) {
        const labels = {
            full: "Full Tutorial",
            basics: "Interface Basics",
            canvas: "Canvas & Navigation",
            widgets: "Widgets & Connections",
            io: "Inputs & Outputs",
            debug: "Data & Debugging",
            properties: "Properties Panel",
            scripts: "Scripts & Languages",
            decisions: "Decision Nodes",
            run: "Run Controls & Validation",
            console: "Execution Console",
            shortcuts: "Keyboard Shortcuts"
        };

        return labels[sectionId] || "Tutorial";
    }

    getInterfaceTutorialSteps(section = "full") {
        const openMenu = (name) => () => {
            this.clearTutorialPreparation();
            document
                .querySelector(`[data-tour="${name}"]`)
                ?.classList.add("tutorial-menu-open");
        };

        const showProps = (name = null) => () => {
            this.clearTutorialPreparation();
            this.prepareTutorialProperties();

            const element = name
                ? document.querySelector(
                    `[data-tour="${name}"]`
                )
                : null;

            if (element) {
                this.expandPropertyGroupForElement(
                    element
                );
            }

            element?.scrollIntoView({
                block: "center",
                behavior: "auto"
            });
        };

        const allSteps = [
            {
                sections: ["basics"],
                title: "Welcome",
                target: null,
                text: "Build a workflow by adding nodes, connecting ports, setting properties, then validating and running it."
            },
            {
                sections: ["basics"],
                title: "File",
                target: '[data-tour="file-menu"]',
                prepare: openMenu("file-menu"),
                text: "New starts over. Import loads a saved JSON workflow. Export saves the current one. Ctrl+S exports quickly."
            },
            {
                sections: ["basics", "shortcuts"],
                title: "Edit",
                target: '[data-tour="edit-menu"]',
                prepare: openMenu("edit-menu"),
                text: "Undo and Redo reverse edits. Duplicate Selected makes a copy of the current widget."
            },
            {
                sections: ["basics", "canvas"],
                title: "View",
                target: '[data-tour="view-menu"]',
                prepare: openMenu("view-menu"),
                text: "Show or hide panels and the console. Reset View recenters the canvas and returns zoom to 100%."
            },
            {
                sections: ["basics", "run"],
                title: "Workflow",
                target: '[data-tour="workflow-menu"]',
                prepare: openMenu("workflow-menu"),
                text: "Run the whole workflow, one selected node, or everything after a selected node. You can also pause, resume, stop, validate, or reset statuses."
            },
            {
                sections: ["basics", "shortcuts"],
                title: "Undo / Redo",
                target: '[data-tour="history-controls"]',
                text: "Use these arrows for quick Undo and Redo. The terminal icon beside them opens the Execution Console."
            },
            {
                sections: ["run", "basics"],
                title: "Run controls",
                target: '[data-tour="run-controls"]',
                text: "Play runs the full workflow. Pause freezes execution and resumes from the same point. Stop ends the current run."
            },
            {
                sections: ["basics", "widgets"],
                title: "Widget Library",
                target: '[data-tour="left-panel"]',
                prepare: () => {
                    this.clearTutorialPreparation();
                    if (!this.leftPanelVisible) {
                        this.togglePanel("left");
                    }
                },
                text: "Start provides values. Process changes data. Decision chooses a branch. End receives the result."
            },
            {
                sections: ["canvas"],
                title: "Workspace",
                target: '[data-tour="workspace"]',
                text: "Drag widgets to move them. Scroll to zoom. Middle-mouse drag pans the canvas. Click empty space to deselect."
            },
            {
                sections: ["widgets", "io"],
                title: "Widgets and ports",
                target: ".widget",
                prepare: () => {
                    this.clearTutorialPreparation();
                    const widget =
                        this.widgets.find(
                            (item) => item.type === "Process"
                        ) || this.widgets[0];
                    if (widget) this.selectWidget(widget);
                },
                text: "Inputs are on the left and outputs are on the right. Empty/default values stay visually quiet so the flow is easy to scan."
            },
            {
                sections: ["widgets"],
                title: "Status and collapse",
                target: ".widget",
                prepare: () => {
                    this.clearTutorialPreparation();
                    const widget =
                        this.widgets.find(
                            (item) => item.type === "Process"
                        ) || this.widgets[0];
                    if (widget) this.selectWidget(widget);
                },
                text: "The small header dot shows status. Hover or focus it for details. Use the chevron to collapse a widget while keeping its ports available."
            },
            {
                sections: ["widgets", "io", "decisions", "debug"],
                title: "Connections",
                target: '[data-tour="workspace"]',
                text: "Drag an output circle to an input circle. Green is compatible, amber needs conversion, and red is invalid."
            },
            {
                sections: ["widgets", "canvas"],
                title: "Peek Mode",
                target: '[data-tour="workspace"]',
                text: "If widgets or lines overlap, hover the visible part to fade what is covering it."
            },
            {
                sections: ["canvas"],
                title: "Workflow Map",
                target: '[data-tour="workflow-map"]',
                text: "Click the map to jump. Drag anywhere on it, or drag the red box, to move around the full canvas."
            },
            {
                sections: ["debug", "io", "widgets"],
                title: "Inspect values",
                target: ".widget",
                prepare: showProps(),
                text: "Click a value inside a widget to preview arrays or JSON. Pin important values so they stay visible when the widget is collapsed."
            },
            {
                sections: ["debug", "run"],
                title: "Debug failures",
                target: ".widget",
                prepare: showProps(),
                text: "A failed widget shows an ! indicator. Click it for the error and a suggested next step. Changed results show ↻ until the widget runs again."
            },
            {
                sections: ["properties", "io", "scripts"],
                title: "Properties panel",
                target: '[data-tour="right-panel"]',
                prepare: showProps(),
                text: "Select a widget to edit it here. Basic and Inputs & Outputs stay open; Execution and Advanced stay tucked away until you need them."
            },
            {
                sections: ["properties"],
                title: "Basic properties",
                target: '[data-tour="properties-general"]',
                prepare: showProps("properties-general"),
                text: "Change the widget title and type here. Position shows where the widget sits on the canvas."
            },
            {
                sections: ["properties", "io"],
                title: "Inputs",
                target: '[data-tour="properties-inputs"]',
                prepare: showProps("properties-inputs"),
                text: "Name and type each input. The Source dropdown can connect another node automatically. Add, remove, or mark inputs Required."
            },
            {
                sections: ["properties", "io"],
                title: "Multiple input sources",
                target: '[data-tour="properties-inputs"]',
                prepare: showProps("properties-inputs"),
                text: "One input can receive several connections. Multiple incoming values arrive as an ordered array."
            },
            {
                sections: ["properties", "io"],
                title: "Outputs",
                target: '[data-tour="properties-outputs"]',
                prepare: showProps("properties-outputs"),
                text: "Name and type outputs here. Start nodes can set starting values, and one output can feed many other nodes."
            },
            {
                sections: ["properties", "io", "scripts"],
                title: "Data types",
                target: '[data-tour="properties-inputs"]',
                prepare: showProps("properties-inputs"),
                text: "Any is flexible. String, Number, Boolean, Array, and JSON add type checks so bad connections are easier to catch."
            },
            {
                sections: ["properties", "scripts"],
                title: "Script / Source",
                target: '[data-tour="properties-script"]',
                prepare: showProps("properties-script"),
                text: "Process nodes can pass data through or use Expression, Bash, Python, or JavaScript simulation. Input names become variables."
            },
            {
                sections: ["decisions", "properties"],
                title: "Decision Branching",
                target: '[data-tour="right-panel"]',
                prepare: () => {
                    this.clearTutorialPreparation();
                    if (!this.rightPanelVisible) {
                        this.togglePanel("right");
                    }

                    const decision =
                        this.widgets.find(
                            (item) => item.type === "Decision"
                        );

                    if (decision) {
                        this.selectWidget(decision);

                        const decisionProperties =
                            document.querySelector(
                                '[data-tour="properties-decision"]'
                            );

                        this.expandPropertyGroupForElement(
                            decisionProperties
                        );

                        decisionProperties
                            ?.scrollIntoView({
                                block: "center",
                                behavior: "auto"
                            });
                    }
                },
                text: "Write a condition such as value > 10. TRUE uses one output and FALSE uses the other; only the chosen branch runs."
            },
            {
                sections: ["properties", "run", "decisions"],
                title: "Status & Performance",
                target: '[data-tour="properties-status"]',
                prepare: showProps("properties-status"),
                text: "The header indicator gives the quick status. Open Execution here for exact status, runtime, memory, branch details, and errors."
            },
            {
                sections: ["properties", "run"],
                title: "Validate / Run / Delete",
                target: '[data-tour="properties-actions"]',
                prepare: showProps("properties-actions"),
                text: "Run This Node tests only the selected widget. Run From Here continues through its downstream path. Full Run executes everything."
            },
            {
                sections: ["run", "console"],
                title: "Execution Console",
                target: '[data-tour="execution-console"]',
                prepare: () => {
                    this.clearTutorialPreparation();
                    this.setExecutionConsoleOpen(true);
                },
                text: "The console shows what ran, values, warnings, errors, runtime, and memory. Drag its top edge to resize it."
            },
            {
                sections: ["run", "console"],
                title: "Console controls",
                target: '[data-tour="execution-console"]',
                prepare: () => {
                    this.clearTutorialPreparation();
                    this.setExecutionConsoleOpen(true);
                },
                text: "Clear removes old logs. Auto-scroll keeps the newest message visible. Ctrl+` opens or closes the console."
            },
            {
                sections: ["run", "canvas"],
                title: "Status bar",
                target: '[data-tour="stats-bar"]',
                text: "The bottom bar shows widget count, total runtime, memory, and the current selection or zoom."
            },
            {
                sections: ["widgets"],
                title: "Context menus",
                target: '[data-tour="workspace"]',
                text: "Right-click a widget or connection for quick actions such as Properties, Duplicate, Disconnect, or Delete."
            },
            {
                sections: ["shortcuts"],
                title: "Keyboard Shortcuts",
                target: '[data-tour="help-menu"]',
                text: "Ctrl+Enter runs everything. Ctrl+Shift+Enter runs the selected node. Ctrl+Alt+Enter runs from it. Ctrl+. pauses or resumes."
            },
            {
                sections: ["basics"],
                title: "You're ready",
                target: null,
                text: "A simple flow is: add nodes → set inputs and outputs → connect them → validate → run. Use Help anytime for one topic."
            }
        ];

        if (section === "full") {
            return allSteps;
        }

        return allSteps.filter(
            (step) =>
                Array.isArray(step.sections) &&
                step.sections.includes(section)
        );
    }

    clearTutorialPreparation() {
        document.querySelectorAll(".tutorial-menu-open").forEach((el) => el.classList.remove("tutorial-menu-open"));
    }

    prepareTutorialProperties() {
        if (!this.rightPanelVisible) this.togglePanel("right");
        const widget = this.selectedWidget || this.widgets.find((x) => x.type === "Process") || this.widgets.find((x) => x.type !== "Decision") || this.widgets[0];
        if (widget) this.selectWidget(widget);
    }

    showTutorialStep() {
        if (!this.tutorialActive || !this.tutorialCard) return;
        const step = this.tutorialSteps[this.tutorialStepIndex];
        if (!step) { this.finishInterfaceTutorial(); return; }

        this.clearTutorialPreparation();
        if (typeof step.prepare === "function") step.prepare();

        const number = this.tutorialStepIndex + 1;
        const total = this.tutorialSteps.length;
        this.tutorialCard.innerHTML = "";

        const top = document.createElement("div"); top.className = "interface-tutorial-card-top";
        const progress = document.createElement("span");
        progress.className = "interface-tutorial-progress";
        progress.textContent =
            `${this.tutorialSectionLabel} · ${number} of ${total}`;

        const skip = document.createElement("button");
        skip.type = "button";
        skip.className = "interface-tutorial-skip";
        skip.textContent = "Close";
        skip.addEventListener(
            "click",
            () => this.finishInterfaceTutorial()
        );
        top.append(progress, skip);

        const title = document.createElement("h2"); title.textContent = step.title;
        const text = document.createElement("p"); text.textContent = step.text;
        const hint = document.createElement("div");
        hint.className = "interface-tutorial-key-hint";
        hint.textContent = "← / → to move · Esc to close";
        const actions = document.createElement("div"); actions.className = "interface-tutorial-actions";
        const back = document.createElement("button"); back.type="button"; back.className="interface-tutorial-secondary"; back.textContent="← Back"; back.disabled=this.tutorialStepIndex===0; back.addEventListener("click",()=>this.previousTutorialStep());
        const next = document.createElement("button"); next.type="button"; next.className="interface-tutorial-primary"; next.textContent=number===total?"Finish":"Next →"; next.addEventListener("click",()=>this.nextTutorialStep());
        actions.append(back,next);
        this.tutorialCard.append(top,title,text,hint,actions);

        requestAnimationFrame(()=>{ this.positionTutorialStep(); next.focus({preventScroll:true}); });
    }

    positionTutorialStep() {
        if (!this.tutorialActive || !this.tutorialCard || !this.tutorialHighlight) return;
        const step = this.tutorialSteps[this.tutorialStepIndex];
        let target = step?.target ? document.querySelector(step.target) : null;
        if (target?.hidden) target = null;

        const vw=window.innerWidth, vh=window.innerHeight, margin=16, gap=14;
        const cardRect=this.tutorialCard.getBoundingClientRect();

        if (!target) {
            this.tutorialHighlight.classList.add("tutorial-highlight-fullscreen");
            Object.assign(this.tutorialHighlight.style,{left:"0px",top:"0px",width:"0px",height:"0px"});
            this.tutorialCard.style.left=`${Math.max(margin,(vw-cardRect.width)/2)}px`;
            this.tutorialCard.style.top=`${Math.max(margin,(vh-cardRect.height)/2)}px`;
            return;
        }

        this.tutorialHighlight.classList.remove("tutorial-highlight-fullscreen");
        const r=target.getBoundingClientRect(), p=6;
        const l=Math.max(4,r.left-p), t=Math.max(4,r.top-p), rr=Math.min(vw-4,r.right+p), bb=Math.min(vh-4,r.bottom+p);
        Object.assign(this.tutorialHighlight.style,{left:`${l}px`,top:`${t}px`,width:`${Math.max(0,rr-l)}px`,height:`${Math.max(0,bb-t)}px`});

        const candidates=[
            {left:r.left,top:r.bottom+gap},
            {left:r.right+gap,top:r.top},
            {left:r.left-cardRect.width-gap,top:r.top},
            {left:r.left,top:r.top-cardRect.height-gap}
        ];
        let pos=candidates.find(x=>x.left>=margin&&x.top>=margin&&x.left+cardRect.width<=vw-margin&&x.top+cardRect.height<=vh-margin);
        if(!pos) pos={left:Math.max(margin,Math.min(vw-cardRect.width-margin,r.left)),top:Math.max(margin,Math.min(vh-cardRect.height-margin,r.bottom+gap))};
        this.tutorialCard.style.left=`${pos.left}px`; this.tutorialCard.style.top=`${pos.top}px`;
    }

    nextTutorialStep() {
        if (!this.tutorialActive) return;
        if (this.tutorialStepIndex >= this.tutorialSteps.length - 1) { this.finishInterfaceTutorial(); return; }
        this.tutorialStepIndex += 1; this.showTutorialStep();
    }

    previousTutorialStep() {
        if (!this.tutorialActive) return;
        this.tutorialStepIndex = Math.max(0, this.tutorialStepIndex - 1); this.showTutorialStep();
    }

    finishInterfaceTutorial() {
        if (!this.tutorialActive) return;
        this.clearTutorialPreparation();
        if (this.tutorialResizeHandler) window.removeEventListener("resize", this.tutorialResizeHandler);
        this.tutorialLayer?.remove();
        const previous=this.tutorialPreviousUiState;
        this.tutorialActive=false; this.tutorialLayer=null; this.tutorialHighlight=null; this.tutorialCard=null; this.tutorialResizeHandler=null; this.tutorialSteps=[]; this.tutorialStepIndex=0; this.tutorialSectionId="full"; this.tutorialSectionLabel="Full Tutorial";

        if (previous) {
            if (this.leftPanelVisible !== previous.leftPanelVisible) this.togglePanel("left");
            if (this.rightPanelVisible !== previous.rightPanelVisible) this.togglePanel("right");
            if (this.executionConsoleOpen !== previous.executionConsoleOpen) this.setExecutionConsoleOpen(previous.executionConsoleOpen);
            const c=previous.selectedConnectionId ? this.connections.find(x=>x.id===previous.selectedConnectionId) : null;
            const w=previous.selectedWidgetId ? this.widgets.find(x=>x.id===previous.selectedWidgetId) : null;
            if(c) this.selectConnection(c); else if(w) this.selectWidget(w); else this.selectWidget(null);
        }
        this.tutorialPreviousUiState=null;
    }

    showShortcutHelp() {
        return this.showMessageDialog({
            title: "Keyboard Shortcuts",
            message:
                "Ctrl+Z — Undo\n" +
                "Ctrl+Y / Ctrl+Shift+Z — Redo\n" +
                "Ctrl+D — Duplicate selected widget\n" +
                "Ctrl+S — Export workflow JSON\n" +
                "Ctrl+Enter — Run full workflow\n" +
                "Ctrl+Shift+Enter — Run selected node\n" +
                "Ctrl+Alt+Enter — Run from selected node\n" +
                "Ctrl+. — Pause / resume current run\n" +
                "Ctrl+` — Toggle execution console\n" +
                "Delete — Delete selected widget/connection\n" +
                "Escape — Deselect / close peek state\n" +
                "Middle mouse drag — Pan canvas",
            tone: "info",
            confirmLabel: "Got it"
        });
    }

    pauseWorkflowRun() {
        if (
            !this.isWorkflowRunning ||
            this.isWorkflowPaused
        ) {
            return;
        }

        this.isWorkflowPaused = true;
        this.setExecutionConsoleStatus("paused");
        this.appendExecutionLog(
            "info",
            "Workflow paused.",
            this.currentRunningWidget
                ? `Paused near ${this.currentRunningWidget.title}.`
                : "Execution will resume from the same point."
        );
        this.updateRunControls();
        this.updateStats();
    }

    resumeWorkflowRun() {
        if (
            !this.isWorkflowRunning ||
            !this.isWorkflowPaused
        ) {
            return;
        }

        this.isWorkflowPaused = false;
        this.setExecutionConsoleStatus("running");
        this.releaseWorkflowPauseWaiters();
        this.appendExecutionLog(
            "info",
            "Workflow resumed."
        );
        this.updateRunControls();
        this.updateStats();
    }

    toggleWorkflowPause() {
        if (!this.isWorkflowRunning) {
            return;
        }

        if (this.isWorkflowPaused) {
            this.resumeWorkflowRun();
        } else {
            this.pauseWorkflowRun();
        }
    }

    releaseWorkflowPauseWaiters() {
        const resolvers =
            this.workflowPauseResolvers.splice(0);

        resolvers.forEach(
            (resolve) => resolve()
        );
    }

    async waitWhileWorkflowPaused(runId) {
        while (
            this.isWorkflowPaused &&
            runId === this.executionRunId
        ) {
            await new Promise(
                (resolve) => {
                    this.workflowPauseResolvers.push(
                        resolve
                    );
                }
            );
        }

        if (runId !== this.executionRunId) {
            throw new Error(
                "Workflow run stopped."
            );
        }
    }

    updateRunControls() {
        const running =
            this.isWorkflowRunning;

        const hasSelectedWidget =
            Boolean(this.selectedWidget);

        if (this.runWorkflowMenuItem) {
            this.runWorkflowMenuItem.disabled =
                running;
        }

        if (this.runSelectedMenuItem) {
            this.runSelectedMenuItem.disabled =
                running ||
                !hasSelectedWidget;
        }

        if (this.runFromSelectedMenuItem) {
            this.runFromSelectedMenuItem.disabled =
                running ||
                !hasSelectedWidget;
        }

        if (this.pauseWorkflowMenuItem) {
            this.pauseWorkflowMenuItem.disabled =
                !running;

            const pauseMenuLabel =
                this.pauseWorkflowMenuItem.querySelector(
                    ".workflow-menu-label"
                );

            const pauseMenuIcon =
                this.pauseWorkflowMenuItem.querySelector(
                    ".workflow-menu-icon"
                );

            if (pauseMenuLabel) {
                pauseMenuLabel.textContent =
                    this.isWorkflowPaused
                        ? "Resume Run"
                        : "Pause Run";
            }

            if (pauseMenuIcon) {
                pauseMenuIcon.classList.add("fill-icon");
                pauseMenuIcon.innerHTML =
                    this.isWorkflowPaused
                        ? `
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M8 5.5L18 12L8 18.5Z"></path>
                            </svg>
                        `
                        : `
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M7 5H10V19H7Z"></path>
                                <path d="M14 5H17V19H14Z"></path>
                            </svg>
                        `;
            }
        }

        if (this.stopWorkflowMenuItem) {
            this.stopWorkflowMenuItem.disabled =
                !running;
        }

        if (this.runToolbarButton) {
            this.runToolbarButton.disabled =
                running;
            this.runToolbarButton.classList.toggle(
                "running",
                running &&
                !this.isWorkflowPaused
            );
        }

        if (this.pauseToolbarButton) {
            this.pauseToolbarButton.disabled =
                !running;
            this.pauseToolbarButton.title =
                this.isWorkflowPaused
                    ? "Resume Run (Ctrl+.)"
                    : "Pause Run (Ctrl+.)";
            this.pauseToolbarButton.setAttribute(
                "aria-label",
                this.isWorkflowPaused
                    ? "Resume Run"
                    : "Pause Run"
            );
            this.pauseToolbarButton.classList.toggle(
                "paused",
                this.isWorkflowPaused
            );
            this.pauseToolbarButton.innerHTML =
                this.isWorkflowPaused
                    ? `
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path class="run-icon-fill" d="M8 5.5L18 12L8 18.5Z"></path>
                        </svg>
                    `
                    : `
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path class="run-icon-fill" d="M7 5H10V19H7Z"></path>
                            <path class="run-icon-fill" d="M14 5H17V19H14Z"></path>
                        </svg>
                    `;
        }

        if (this.stopToolbarButton) {
            this.stopToolbarButton.disabled =
                !running;
        }
    }

    clearBranchExecutionState(
        {
            clearDecisionResults = false
        } = {}
    ) {
        this.branchConnectionStates.clear();
        this.hasBranchExecutionState = false;

        this.connections.forEach(
            (connection) => {
                if (!connection.element) {
                    return;
                }

                connection.element.classList.remove(
                    "connection-branch-active",
                    "connection-branch-inactive"
                );
            }
        );

        if (clearDecisionResults) {
            this.widgets.forEach(
                (widget) => {
                    if (
                        widget.type ===
                        "Decision"
                    ) {
                        widget.lastDecisionResult =
                            null;
                        widget.refreshContent();
                    }
                }
            );
        }
    }

    getConnectionBranchState(
        connection
    ) {
        if (!connection) {
            return "pending";
        }

        return (
            this.branchConnectionStates.get(
                connection.id
            ) || "pending"
        );
    }

    setConnectionBranchState(
        connection,
        state
    ) {
        if (!connection) {
            return;
        }

        const normalizedState =
            state === "active" ||
            state === "inactive"
                ? state
                : "pending";

        if (normalizedState === "pending") {
            this.branchConnectionStates.delete(
                connection.id
            );
        } else {
            this.branchConnectionStates.set(
                connection.id,
                normalizedState
            );
        }

        if (!connection.element) {
            return;
        }

        connection.element.classList.toggle(
            "connection-branch-active",
            normalizedState === "active"
        );

        connection.element.classList.toggle(
            "connection-branch-inactive",
            normalizedState === "inactive"
        );
    }

    setWidgetOutgoingBranchStates(
        widget,
        {
            activeOutputIds = null,
            forceInactive = false
        } = {}
    ) {
        const allowedOutputIds =
            activeOutputIds
                ? new Set(
                    activeOutputIds
                )
                : null;

        this.connections
            .filter(
                (connection) =>
                    connection.sourceWidget ===
                    widget
            )
            .forEach(
                (connection) => {
                    const active =
                        !forceInactive &&
                        (
                            !allowedOutputIds ||
                            allowedOutputIds.has(
                                connection.sourcePortId
                            )
                        );

                    this.setConnectionBranchState(
                        connection,
                        active
                            ? "active"
                            : "inactive"
                    );
                }
            );
    }

    getActiveIncomingConnections(
        widget,
        inputPortId = null
    ) {
        return this.connections.filter(
            (connection) => {
                if (
                    connection.targetWidget !==
                    widget
                ) {
                    return false;
                }

                if (
                    inputPortId &&
                    connection.targetPortId !==
                    inputPortId
                ) {
                    return false;
                }

                return (
                    this.getConnectionBranchState(
                        connection
                    ) === "active"
                );
            }
        );
    }

    shouldExecuteWidgetForBranches(
        widget
    ) {
        const incomingConnections =
            this.connections.filter(
                (connection) =>
                    connection.targetWidget ===
                    widget
            );

        /*
         * Root nodes always execute. This includes Start widgets and
         * manually configured source-like Process nodes.
         */
        if (incomingConnections.length === 0) {
            return true;
        }

        const activeIncoming =
            incomingConnections.filter(
                (connection) =>
                    this.getConnectionBranchState(
                        connection
                    ) === "active"
            );

        if (activeIncoming.length === 0) {
            return false;
        }

        /*
         * Every required input must either receive at least one ACTIVE
         * branch connection or have a manual fallback value.
         */
        for (const input of widget.inputs) {
            if (input.required === false) {
                continue;
            }

            const structuralSources =
                this.getIncomingConnections(
                    widget,
                    input.id
                );

            if (structuralSources.length === 0) {
                continue;
            }

            const activeSources =
                structuralSources.filter(
                    (connection) =>
                        this.getConnectionBranchState(
                            connection
                        ) === "active"
                );

            const hasManualFallback =
                String(
                    input.manualValue ?? ""
                ).trim() !== "";

            if (
                activeSources.length === 0 &&
                !hasManualFallback
            ) {
                return false;
            }
        }

        return true;
    }

    getDecisionPayload(
        widget,
        context,
        conditionResult
    ) {
        if (
            widget.decisionPayloadMode ===
            "condition-result"
        ) {
            return conditionResult;
        }

        if (
            widget.decisionPayloadMode ===
            "input-object"
        ) {
            const payload = {};

            widget.inputs.forEach(
                (input, index) => {
                    const name =
                        this.sanitizeInputName(
                            input.name,
                            index
                        );

                    payload[name] =
                        context[name];
                }
            );

            return payload;
        }

        return widget.inputs[0]
            ? widget.inputs[0].value
            : conditionResult;
    }

    executeDecisionBranch(
        widget,
        context
    ) {
        widget.ensureDecisionConfiguration(
            false
        );

        const expression =
            String(
                widget.decisionExpression ||
                ""
            ).trim();

        if (expression === "") {
            throw new Error(
                `Decision widget "${widget.title}" has no condition.`
            );
        }

        const rawResult =
            this.safeEvaluateExpression(
                expression,
                context
            );

        const conditionResult =
            Boolean(rawResult);

        const selectedOutput =
            conditionResult
                ? widget.getDecisionTrueOutput()
                : widget.getDecisionFalseOutput();

        if (!selectedOutput) {
            throw new Error(
                `Decision widget "${widget.title}" does not have a valid ${conditionResult ? "TRUE" : "FALSE"} output.`
            );
        }

        const payload =
            this.getDecisionPayload(
                widget,
                context,
                conditionResult
            );

        /*
         * Clear stale values from every non-selected branch so a previous
         * workflow run can never leak data into the current run.
         */
        widget.outputs.forEach(
            (output) => {
                if (
                    output.id !==
                    selectedOutput.id
                ) {
                    output.value = "";
                }
            }
        );

        try {
            selectedOutput.value =
                this.coerceValueForPort(
                    payload,
                    selectedOutput
                );
        } catch (error) {
            throw new Error(
                `Decision branch output "${selectedOutput.name}" (${this.getPortDataType(selectedOutput)}): ${error.message}`
            );
        }

        widget.lastDecisionResult =
            conditionResult;

        this.setWidgetOutgoingBranchStates(
            widget,
            {
                activeOutputIds: [
                    selectedOutput.id
                ]
            }
        );

        widget.refreshContent();

        return {
            conditionResult,
            selectedOutput,
            payload
        };
    }

    getTopologicalOrderForWidgets(
        widgets
    ) {
        const allowedWidgets =
            new Set(widgets || []);

        const indegree = new Map();
        const outgoing = new Map();

        allowedWidgets.forEach(
            (widget) => {
                indegree.set(widget, 0);
                outgoing.set(widget, []);
            }
        );

        this.connections.forEach(
            (connection) => {
                if (
                    !allowedWidgets.has(
                        connection.sourceWidget
                    ) ||
                    !allowedWidgets.has(
                        connection.targetWidget
                    )
                ) {
                    return;
                }

                outgoing
                    .get(connection.sourceWidget)
                    .push(
                        connection.targetWidget
                    );

                indegree.set(
                    connection.targetWidget,
                    indegree.get(
                        connection.targetWidget
                    ) + 1
                );
            }
        );

        const queue =
            Array.from(allowedWidgets)
                .filter(
                    (widget) =>
                        indegree.get(widget) === 0
                );

        const order = [];

        while (queue.length > 0) {
            const widget = queue.shift();
            order.push(widget);

            outgoing
                .get(widget)
                .forEach(
                    (targetWidget) => {
                        const nextIndegree =
                            indegree.get(
                                targetWidget
                            ) - 1;

                        indegree.set(
                            targetWidget,
                            nextIndegree
                        );

                        if (nextIndegree === 0) {
                            queue.push(
                                targetWidget
                            );
                        }
                    }
                );
        }

        return {
            order,
            hasCycle:
                order.length !==
                allowedWidgets.size
        };
    }

    getTopologicalOrder() {
        return this.getTopologicalOrderForWidgets(
            this.widgets
        );
    }

    getDownstreamWidgets(
        startWidget
    ) {
        if (!startWidget) {
            return [];
        }

        const visited =
            new Set([startWidget]);

        const queue =
            [startWidget];

        while (queue.length > 0) {
            const widget = queue.shift();

            this.connections
                .filter(
                    (connection) =>
                        connection.sourceWidget ===
                        widget
                )
                .forEach(
                    (connection) => {
                        const target =
                            connection.targetWidget;

                        if (!visited.has(target)) {
                            visited.add(target);
                            queue.push(target);
                        }
                    }
                );
        }

        return Array.from(visited);
    }

    getExecutionPlan(
        mode = "workflow",
        widget = null
    ) {
        if (mode === "selected") {
            return {
                mode,
                widget,
                order:
                    widget
                        ? [widget]
                        : [],
                hasCycle: false,
                label:
                    widget
                        ? `single node · ${widget.title}`
                        : "single node"
            };
        }

        if (mode === "from-selected") {
            const order =
                this.getDownstreamWidgets(
                    widget
                );

            const topology =
                this.getTopologicalOrderForWidgets(
                    order
                );

            return {
                mode,
                widget,
                order:
                    topology.order,
                hasCycle:
                    topology.hasCycle,
                label:
                    widget
                        ? `from ${widget.title}`
                        : "from selected node"
            };
        }

        const topology =
            this.getTopologicalOrder();

        return {
            mode: "workflow",
            widget: null,
            order:
                topology.order,
            hasCycle:
                topology.hasCycle,
            label: "full workflow"
        };
    }

    getExecutionPlanValidationReport(
        executionOrder,
        {
            mode = "workflow"
        } = {}
    ) {
        if (mode === "workflow") {
            return this.getWorkflowValidationReport();
        }

        const errors = [];
        const warnings = [];
        const executionSet =
            new Set(executionOrder || []);

        if (executionSet.size === 0) {
            errors.push(
                "Select a widget before using this run mode."
            );

            return {
                valid: false,
                errors,
                warnings
            };
        }

        const topology =
            this.getTopologicalOrderForWidgets(
                Array.from(executionSet)
            );

        if (topology.hasCycle) {
            errors.push(
                "The selected execution path contains a cycle."
            );
        }

        executionSet.forEach(
            (widget) => {
                widget.inputs.forEach(
                    (input) => {
                        const incomingConnections =
                            this.getIncomingConnections(
                                widget,
                                input.id
                            );

                        const internalSources =
                            incomingConnections.filter(
                                (connection) =>
                                    executionSet.has(
                                        connection.sourceWidget
                                    )
                            );

                        const externalSources =
                            incomingConnections.filter(
                                (connection) =>
                                    !executionSet.has(
                                        connection.sourceWidget
                                    )
                            );

                        const manualValue =
                            String(
                                input.manualValue ?? ""
                            ).trim();

                        const externalHasValue =
                            externalSources.some(
                                (connection) => {
                                    const output =
                                        connection.sourceWidget
                                            .getOutputById(
                                                connection.sourcePortId
                                            );

                                    return (
                                        output &&
                                        String(
                                            output.value ?? ""
                                        ).trim() !== ""
                                    );
                                }
                            );

                        if (
                            input.required !== false &&
                            internalSources.length === 0 &&
                            !externalHasValue &&
                            manualValue === ""
                        ) {
                            errors.push(
                                `"${widget.title}" needs a current value for input "${input.name}" before this partial run can start.`
                            );
                        }

                        if (
                            incomingConnections.length === 0 &&
                            manualValue !== "" &&
                            this.getPortDataType(input) !==
                                "Any"
                        ) {
                            try {
                                this.coerceValueForPort(
                                    input.manualValue,
                                    input
                                );
                            } catch (error) {
                                errors.push(
                                    `"${widget.title}" input "${input.name}" is invalid: ${error.message}`
                                );
                            }
                        }

                        incomingConnections.forEach(
                            (connection) => {
                                const sourcePort =
                                    connection.sourceWidget
                                        .getOutputById(
                                            connection.sourcePortId
                                        );

                                if (!sourcePort) {
                                    errors.push(
                                        `A connection into "${widget.title}" references a missing source output.`
                                    );
                                    return;
                                }

                                const compatibility =
                                    this.getPortTypeCompatibility(
                                        sourcePort,
                                        input
                                    );

                                if (!compatibility.compatible) {
                                    errors.push(
                                        `Type mismatch into "${widget.title} / ${input.name}": ${compatibility.sourceType} cannot feed ${compatibility.targetType}.`
                                    );
                                } else if (
                                    compatibility.level ===
                                    "convertible"
                                ) {
                                    warnings.push(
                                        `"${widget.title} / ${input.name}" will convert ${compatibility.sourceType} to ${compatibility.targetType} at runtime.`
                                    );
                                }
                            }
                        );
                    }
                );

                if (widget.type === "Decision") {
                    const expression =
                        String(
                            widget.decisionExpression ||
                            ""
                        ).trim();

                    if (expression === "") {
                        errors.push(
                            `Decision widget "${widget.title}" has no condition.`
                        );
                    }

                    if (
                        !widget.getDecisionTrueOutput() ||
                        !widget.getDecisionFalseOutput()
                    ) {
                        errors.push(
                            `Decision widget "${widget.title}" needs valid TRUE and FALSE outputs.`
                        );
                    }
                }

                if (
                    widget.language === "Expression" &&
                    widget.type !== "Start" &&
                    widget.type !== "End" &&
                    widget.type !== "Decision" &&
                    String(widget.source || "").trim() === ""
                ) {
                    warnings.push(
                        `"${widget.title}" has an empty Expression source and will pass through its first input.`
                    );
                }
            }
        );

        return {
            valid:
                errors.length === 0,
            errors,
            warnings
        };
    }

    prepareBranchStateForExecutionPlan(
        executionOrder
    ) {
        const executionSet =
            new Set(executionOrder || []);

        this.clearBranchExecutionState({
            clearDecisionResults: true
        });
        this.hasBranchExecutionState = true;

        this.connections.forEach(
            (connection) => {
                if (
                    executionSet.has(
                        connection.targetWidget
                    ) &&
                    !executionSet.has(
                        connection.sourceWidget
                    )
                ) {
                    this.setConnectionBranchState(
                        connection,
                        "active"
                    );
                }
            }
        );
    }

    runSelectedWidget(
        widget = this.selectedWidget
    ) {
        if (!widget) {
            void this.showMessageDialog({
                title: "Select a Widget",
                message:
                    "Select the widget you want to run, then choose Run Selected Node.",
                tone: "info",
                confirmLabel: "Got it"
            });
            return;
        }

        return this.runWorkflow({
            mode: "selected",
            widget
        });
    }

    runFromSelectedWidget(
        widget = this.selectedWidget
    ) {
        if (!widget) {
            void this.showMessageDialog({
                title: "Select a Widget",
                message:
                    "Select where execution should begin, then choose Run From Selected Node.",
                tone: "info",
                confirmLabel: "Got it"
            });
            return;
        }

        return this.runWorkflow({
            mode: "from-selected",
            widget
        });
    }

    getWorkflowValidationReport() {
        const errors = [];
        const warnings = [];

        if (this.widgets.length === 0) {
            errors.push(
                "The workflow has no widgets."
            );

            return {
                valid: false,
                errors,
                warnings
            };
        }

        const startWidgets =
            this.widgets.filter(
                (widget) =>
                    widget.type === "Start"
            );

        const endWidgets =
            this.widgets.filter(
                (widget) =>
                    widget.type === "End"
            );

        if (startWidgets.length === 0) {
            warnings.push(
                "No Start widget is defined. Nodes with no dependencies will run first."
            );
        }

        if (endWidgets.length === 0) {
            warnings.push(
                "No End widget is defined."
            );
        }

        this.connections.forEach(
            (connection) => {
                const sourcePort =
                    connection.sourceWidget
                        .getOutputById(
                            connection.sourcePortId
                        );

                const targetPort =
                    connection.targetWidget
                        .getInputById(
                            connection.targetPortId
                        );

                if (!sourcePort) {
                    errors.push(
                        `Connection ${connection.id} references a missing output on "${connection.sourceWidget.title}".`
                    );
                }

                if (!targetPort) {
                    errors.push(
                        `Connection ${connection.id} references a missing input on "${connection.targetWidget.title}".`
                    );
                }

                if (sourcePort && targetPort) {
                    const compatibility =
                        this.getPortTypeCompatibility(
                            sourcePort,
                            targetPort
                        );

                    if (!compatibility.compatible) {
                        errors.push(
                            `Type mismatch: "${connection.sourceWidget.title} / ${sourcePort.name}" is ${compatibility.sourceType}, but "${connection.targetWidget.title} / ${targetPort.name}" expects ${compatibility.targetType}.`
                        );
                    } else if (
                        compatibility.level ===
                        "convertible"
                    ) {
                        warnings.push(
                            `Runtime conversion: "${connection.sourceWidget.title} / ${sourcePort.name}" (${compatibility.sourceType}) → "${connection.targetWidget.title} / ${targetPort.name}" (${compatibility.targetType}).`
                        );
                    }
                }

            }
        );

        this.widgets.forEach(
            (widget) => {
                widget.inputs.forEach(
                    (input) => {
                        const incomingConnections =
                            this.getIncomingConnections(
                                widget,
                                input.id
                            );

                        const manualValue =
                            String(
                                input.manualValue ?? ""
                            ).trim();

                        if (
                            input.required !== false &&
                            incomingConnections.length === 0 &&
                            manualValue === ""
                        ) {
                            errors.push(
                                `"${widget.title}" requires input "${input.name}", but it has no source or manual value.`
                            );
                        }

                        if (
                            incomingConnections.length === 0 &&
                            manualValue !== "" &&
                            this.getPortDataType(input) !==
                                "Any"
                        ) {
                            try {
                                this.coerceValueForPort(
                                    input.manualValue,
                                    input
                                );
                            } catch (error) {
                                errors.push(
                                    `"${widget.title}" input "${input.name}" cannot use its manual value as ${this.getPortDataType(input)}: ${error.message}`
                                );
                            }
                        }
                    }
                );

                widget.outputs.forEach(
                    (output) => {
                        const outgoingCount =
                            this.getOutgoingConnections(
                                widget,
                                output.id
                            ).length;

                        if (
                            outgoingCount === 0 &&
                            widget.type !== "End" &&
                            widget.type !== "Decision"
                        ) {
                            warnings.push(
                                `"${widget.title}" output "${output.name}" is not connected.`
                            );
                        }

                        if (
                            String(
                                output.value ?? ""
                            ).trim() !== "" &&
                            this.getPortDataType(output) !==
                                "Any"
                        ) {
                            try {
                                this.coerceValueForPort(
                                    output.value,
                                    output
                                );
                            } catch (error) {
                                errors.push(
                                    `"${widget.title}" output "${output.name}" cannot provide its current value as ${this.getPortDataType(output)}: ${error.message}`
                                );
                            }
                        }
                    }
                );

                const attachedCount =
                    this.connections.filter(
                        (connection) =>
                            connection.sourceWidget ===
                                widget ||
                            connection.targetWidget ===
                                widget
                    ).length;

                if (
                    this.widgets.length > 1 &&
                    attachedCount === 0
                ) {
                    warnings.push(
                        `"${widget.title}" is completely disconnected.`
                    );
                }

                if (
                    widget.type === "Start" &&
                    widget.inputs.length > 0
                ) {
                    warnings.push(
                        `Start widget "${widget.title}" has input ports. This is allowed, but unusual.`
                    );
                }

                if (
                    widget.type === "End" &&
                    widget.outputs.length > 0
                ) {
                    warnings.push(
                        `End widget "${widget.title}" has output ports. This is allowed, but unusual.`
                    );
                }

                if (widget.type === "Decision") {
                    const expression =
                        String(
                            widget.decisionExpression ||
                            ""
                        ).trim();

                    if (expression === "") {
                        errors.push(
                            `Decision widget "${widget.title}" has no condition expression.`
                        );
                    }

                    if (widget.outputs.length < 2) {
                        errors.push(
                            `Decision widget "${widget.title}" needs at least two outputs for TRUE and FALSE branches.`
                        );
                    }

                    const trueOutput =
                        widget.getDecisionTrueOutput();

                    const falseOutput =
                        widget.getDecisionFalseOutput();

                    if (!trueOutput) {
                        errors.push(
                            `Decision widget "${widget.title}" has no valid TRUE branch output.`
                        );
                    }

                    if (!falseOutput) {
                        errors.push(
                            `Decision widget "${widget.title}" has no valid FALSE branch output.`
                        );
                    }

                    if (
                        trueOutput &&
                        falseOutput &&
                        trueOutput.id ===
                            falseOutput.id
                    ) {
                        errors.push(
                            `Decision widget "${widget.title}" uses the same output for TRUE and FALSE branches.`
                        );
                    }

                    if (
                        expression !== ""
                    ) {
                        try {
                            this.safeEvaluateExpression(
                                expression,
                                this.buildInputContext(
                                    widget
                                )
                            );
                        } catch (error) {
                            errors.push(
                                `Decision widget "${widget.title}" condition is invalid: ${error.message}`
                            );
                        }
                    }

                    if (
                        trueOutput &&
                        this.getOutgoingConnections(
                            widget,
                            trueOutput.id
                        ).length === 0
                    ) {
                        warnings.push(
                            `Decision widget "${widget.title}" TRUE branch "${trueOutput.name}" is not connected.`
                        );
                    }

                    if (
                        falseOutput &&
                        this.getOutgoingConnections(
                            widget,
                            falseOutput.id
                        ).length === 0
                    ) {
                        warnings.push(
                            `Decision widget "${widget.title}" FALSE branch "${falseOutput.name}" is not connected.`
                        );
                    }
                }

                if (
                    widget.language === "Expression" &&
                    widget.type !== "Start" &&
                    widget.type !== "End" &&
                    widget.type !== "Decision" &&
                    String(widget.source || "").trim() === ""
                ) {
                    warnings.push(
                        `"${widget.title}" uses Expression mode but has no source expression; it will pass through its first input.`
                    );
                }
            }
        );

        const topology =
            this.getTopologicalOrder();

        if (topology.hasCycle) {
            errors.push(
                "The workflow contains a cycle. The current execution engine requires an acyclic graph."
            );
        }

        return {
            valid:
                errors.length === 0,
            errors,
            warnings
        };
    }

    formatValidationReport(report) {
        const lines = [];

        lines.push(
            report.valid
                ? "Workflow validation passed."
                : "Workflow validation failed."
        );

        if (report.errors.length > 0) {
            lines.push("", "Errors:");

            report.errors.forEach(
                (error, index) => {
                    lines.push(
                        `${index + 1}. ${error}`
                    );
                }
            );
        }

        if (report.warnings.length > 0) {
            lines.push("", "Warnings:");

            report.warnings.forEach(
                (warning, index) => {
                    lines.push(
                        `${index + 1}. ${warning}`
                    );
                }
            );
        }

        if (
            report.errors.length === 0 &&
            report.warnings.length === 0
        ) {
            lines.push(
                "No issues were found."
            );
        }

        return lines.join("\n");
    }

    validateWorkflow(showAlert = false) {
        const report =
            this.getWorkflowValidationReport();

        this.lastValidationReport = report;

        if (showAlert) {
            this.logValidationReport(
                report,
                { open: true }
            );

            void this.showMessageDialog({
                title:
                    report.valid
                        ? "Workflow Validation"
                        : "Workflow Needs Attention",
                message:
                    this.formatValidationReport(
                        report
                    ),
                tone:
                    report.valid
                        ? "success"
                        : "warning",
                confirmLabel: "Close"
            });
        }

        return report;
    }

    resetWorkflowStatuses() {
        if (this.isWorkflowRunning) {
            this.stopWorkflowRun();
        }

        this.isWorkflowPaused = false;
        this.currentExecutionMode = "idle";
        this.currentExecutionWidgetIds = new Set();
        this.currentExecutionLabel = "";
        this.currentRunningWidget = null;
        this.releaseWorkflowPauseWaiters();

        this.clearBranchExecutionState({
            clearDecisionResults: true
        });

        this.widgets.forEach(
            (widget) => {
                widget.setStatus(
                    widget.type === "Start"
                        ? "idle"
                        : "waiting",
                    0,
                    0,
                    ""
                );
            }
        );

        this.lastRunRuntimeMs = 0;
        this.lastRunMemoryKb = 0;
        this.setExecutionConsoleStatus(
            "idle"
        );
        this.appendExecutionLog(
            "info",
            "Workflow status labels reset."
        );
        this.updateStats();

        if (this.selectedWidget) {
            this.showWidgetProperties(
                this.selectedWidget
            );
        }

        this.scheduleSave();
    }

    stopWorkflowRun() {
        if (!this.isWorkflowRunning) {
            return;
        }

        this.executionRunId += 1;
        this.isWorkflowRunning = false;
        this.isWorkflowPaused = false;
        this.currentExecutionMode = "idle";
        this.currentExecutionWidgetIds = new Set();
        this.currentExecutionLabel = "";
        this.currentRunningWidget = null;
        this.releaseWorkflowPauseWaiters();
        this.setExecutionConsoleStatus(
            "stopped"
        );
        this.appendExecutionLog(
            "warning",
            "Workflow run stopped by user.",
            "Any node that was running has been marked stopped.",
            { open: true }
        );

        this.widgets.forEach(
            (widget) => {
                if (
                    widget.status ===
                    "running"
                ) {
                    widget.setStatus(
                        "stopped",
                        widget.runtimeMs,
                        widget.memoryKb
                    );
                }
            }
        );

        this.updateRunControls();
        this.updateStats();
        this.scheduleSave();
    }

    async waitForExecution(
        milliseconds,
        runId
    ) {
        let remaining =
            Math.max(
                0,
                Math.min(
                    5000,
                    milliseconds
                )
            );

        await this.waitWhileWorkflowPaused(
            runId
        );

        while (remaining > 0) {
            const slice =
                Math.min(
                    50,
                    remaining
                );

            await new Promise(
                (resolve) => {
                    setTimeout(
                        resolve,
                        slice
                    );
                }
            );

            if (
                runId !==
                this.executionRunId
            ) {
                throw new Error(
                    "Workflow run stopped."
                );
            }

            remaining -= slice;

            await this.waitWhileWorkflowPaused(
                runId
            );
        }
    }

    getScriptDelay(widget) {
        const source =
            String(widget.source || "");

        let scriptDelay = 0;

        if (widget.language === "Bash") {
            const match =
                source.match(
                    /^\s*sleep\s+([0-9.]+)/m
                );

            if (match) {
                scriptDelay =
                    Number(match[1]) *
                    1000;
            }
        }

        if (widget.language === "Python") {
            const match =
                source.match(
                    /(?:time\.)?sleep\s*\(\s*([0-9.]+)\s*\)/
                );

            if (match) {
                scriptDelay =
                    Number(match[1]) *
                    1000;
            }
        }

        if (widget.language === "JavaScript") {
            const match =
                source.match(
                    /(?:await\s+)?sleep\s*\(\s*([0-9.]+)\s*\)/
                );

            if (match) {
                scriptDelay =
                    Number(match[1]);
            }
        }

        return Math.min(
            3000,
            Math.max(
                0,
                scriptDelay
            )
        );
    }

    coerceWorkflowValue(value) {
        if (
            typeof value !== "string"
        ) {
            return value;
        }

        const trimmed = value.trim();

        if (trimmed === "") {
            return "";
        }

        if (
            /^-?(?:\d+\.?\d*|\.\d+)$/.test(
                trimmed
            )
        ) {
            return Number(trimmed);
        }

        if (trimmed === "true") {
            return true;
        }

        if (trimmed === "false") {
            return false;
        }

        if (trimmed === "null") {
            return null;
        }

        if (
            (
                trimmed.startsWith("{") &&
                trimmed.endsWith("}")
            ) ||
            (
                trimmed.startsWith("[") &&
                trimmed.endsWith("]")
            )
        ) {
            try {
                return JSON.parse(trimmed);
            } catch (error) {
                return value;
            }
        }

        return value;
    }

    sanitizeInputName(name, index = 0) {
        let identifier =
            String(name || "")
                .trim()
                .replace(
                    /[^A-Za-z0-9_]/g,
                    "_"
                );

        if (identifier === "") {
            identifier =
                `input${index + 1}`;
        }

        if (/^[0-9]/.test(identifier)) {
            identifier =
                `_${identifier}`;
        }

        return identifier;
    }

    buildInputContext(widget) {
        const context = {};

        widget.inputs.forEach(
            (input, index) => {
                const name =
                    this.sanitizeInputName(
                        input.name,
                        index
                    );

                const incomingCount =
                    this.getIncomingConnections(
                        widget,
                        input.id
                    ).length;

                if (
                    incomingCount > 1 &&
                    Array.isArray(
                        input.value
                    )
                ) {
                    context[name] =
                        input.value.map(
                            (value) =>
                                this.coerceValueForPort(
                                    value,
                                    input
                                )
                        );
                } else {
                    context[name] =
                        this.coerceValueForPort(
                            input.value,
                            input
                        );
                }

                context[`input${index + 1}`] =
                    context[name];
            }
        );

        return context;
    }

    safeEvaluateExpression(
        expression,
        context
    ) {
        let source =
            String(expression || "")
                .trim()
                .replace(/;\s*$/, "");

        if (source === "") {
            return "";
        }

        source = source.replace(
            /\binputs\.([A-Za-z_][A-Za-z0-9_]*)/g,
            "$1"
        );

        const literalMatch =
            source.match(
                /^(["'])([\s\S]*)\1$/
            );

        if (literalMatch) {
            return literalMatch[2]
                .replace(/\\n/g, "\n")
                .replace(/\\t/g, "\t");
        }

        if (
            /[`{};\\]/.test(source)
        ) {
            throw new Error(
                "Expression contains unsupported syntax."
            );
        }

        if (
            !/^[\sA-Za-z0-9_+\-*/%()[\].,<>=!&|?:'" ]+$/.test(
                source
            )
        ) {
            throw new Error(
                "Expression contains unsupported characters."
            );
        }

        const sourceWithoutStrings =
            source.replace(
                /(["'])(?:\\.|(?!\1).)*\1/g,
                '""'
            );

        const identifiers =
            sourceWithoutStrings.match(
                /\b[A-Za-z_][A-Za-z0-9_]*\b/g
            ) || [];

        const allowedNames =
            new Set([
                ...Object.keys(context),
                "true",
                "false",
                "null",
                "undefined",
                "NaN",
                "Infinity"
            ]);

        const unknownName =
            identifiers.find(
                (identifier) =>
                    !allowedNames.has(
                        identifier
                    )
            );

        if (unknownName) {
            throw new Error(
                `Unknown input "${unknownName}" in expression.`
            );
        }

        const names =
            Object.keys(context);

        const values =
            names.map(
                (name) =>
                    context[name]
            );

        const evaluator =
            Function(
                ...names,
                `"use strict"; return (${source});`
            );

        return evaluator(...values);
    }

    expandScriptVariables(
        text,
        context
    ) {
        return String(text).replace(
            /\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g,
            (match, name) => {
                if (
                    Object.prototype.hasOwnProperty.call(
                        context,
                        name
                    )
                ) {
                    return String(context[name]);
                }

                return match;
            }
        );
    }

    interpretWidgetSource(
        widget,
        context
    ) {
        const source =
            String(widget.source || "")
                .trim();

        if (
            widget.language ===
            "Pass-through" ||
            source === ""
        ) {
            const firstInput =
                widget.inputs[0];

            return firstInput
                ? firstInput.value
                : (
                    widget.outputs[0]
                        ? widget.outputs[0].value
                        : ""
                );
        }

        if (widget.language === "Expression") {
            return this.safeEvaluateExpression(
                source,
                context
            );
        }

        if (widget.language === "Bash") {
            const echoLines =
                source
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(
                        (line) =>
                            /^echo\s+/i.test(
                                line
                            )
                    );

            if (echoLines.length === 0) {
                return widget.inputs[0]
                    ? widget.inputs[0].value
                    : "";
            }

            let echoValue =
                echoLines[
                    echoLines.length - 1
                ].replace(
                    /^echo\s+/i,
                    ""
                );

            const arithmeticMatch =
                echoValue.match(
                    /^\$\(\((.*)\)\)$/
                );

            if (arithmeticMatch) {
                return this.safeEvaluateExpression(
                    arithmeticMatch[1],
                    context
                );
            }

            echoValue =
                this.expandScriptVariables(
                    echoValue,
                    context
                );

            return echoValue.replace(
                /^(["'])([\s\S]*)\1$/,
                "$2"
            );
        }

        if (widget.language === "Python") {
            const lines =
                source.split(/\r?\n/);

            let expression = "";

            for (
                let index =
                    lines.length - 1;
                index >= 0;
                index -= 1
            ) {
                const line =
                    lines[index].trim();

                const printMatch =
                    line.match(
                        /^print\s*\((.*)\)\s*$/
                    );

                if (printMatch) {
                    expression =
                        printMatch[1];
                    break;
                }

                const returnMatch =
                    line.match(
                        /^return\s+(.+)$/
                    );

                if (returnMatch) {
                    expression =
                        returnMatch[1];
                    break;
                }
            }

            return expression
                ? this.safeEvaluateExpression(
                    expression,
                    context
                )
                : (
                    widget.inputs[0]
                        ? widget.inputs[0].value
                        : ""
                );
        }

        if (widget.language === "JavaScript") {
            const returnMatch =
                source.match(
                    /return\s+([\s\S]*?);?\s*$/m
                );

            if (returnMatch) {
                return this.safeEvaluateExpression(
                    returnMatch[1],
                    context
                );
            }

            return widget.inputs[0]
                ? widget.inputs[0].value
                : "";
        }

        return widget.inputs[0]
            ? widget.inputs[0].value
            : "";
    }

    applyExecutionResult(
        widget,
        result
    ) {
        if (widget.outputs.length === 0) {
            return;
        }

        const assignOutput =
            (output, value) => {
                try {
                    output.value =
                        this.coerceValueForPort(
                            value,
                            output
                        );
                } catch (error) {
                    throw new Error(
                        `Output "${output.name}" (${this.getPortDataType(output)}): ${error.message}`
                    );
                }
            };

        if (Array.isArray(result)) {
            widget.outputs.forEach(
                (output, index) => {
                    if (index < result.length) {
                        assignOutput(
                            output,
                            result[index]
                        );
                    }
                }
            );

            return;
        }

        if (
            result &&
            typeof result === "object"
        ) {
            let matchedOutput = false;

            widget.outputs.forEach(
                (output) => {
                    if (
                        Object.prototype.hasOwnProperty.call(
                            result,
                            output.name
                        )
                    ) {
                        assignOutput(
                            output,
                            result[output.name]
                        );
                        matchedOutput = true;
                    }
                }
            );

            if (matchedOutput) {
                return;
            }
        }

        if (
            widget.language ===
                "Pass-through" &&
            widget.outputs.length > 1
        ) {
            widget.outputs.forEach(
                (output) => {
                    assignOutput(
                        output,
                        result
                    );
                }
            );

            return;
        }

        assignOutput(
            widget.outputs[0],
            result
        );
    }

    estimateWidgetMemory(widget) {
        const payload =
            JSON.stringify(
                {
                    inputs: widget.inputs,
                    outputs: widget.outputs,
                    source: widget.source,
                    language: widget.language
                }
            );

        let bytes = payload.length;

        if (
            typeof TextEncoder !==
            "undefined"
        ) {
            bytes =
                new TextEncoder()
                    .encode(payload)
                    .length;
        }

        return Math.max(
            0.5,
            bytes / 1024
        );
    }

    async runWorkflow(
        {
            mode = "workflow",
            widget = null
        } = {}
    ) {
        if (this.isWorkflowRunning) {
            return;
        }

        const plan =
            this.getExecutionPlan(
                mode,
                widget
            );

        const report =
            this.getExecutionPlanValidationReport(
                plan.order,
                {
                    mode: plan.mode
                }
            );

        this.lastValidationReport = report;

        if (!report.valid) {
            this.setExecutionConsoleStatus(
                "error"
            );
            this.logValidationReport(
                report,
                { open: true }
            );

            await this.showMessageDialog({
                title:
                    plan.mode === "workflow"
                        ? "Workflow Cannot Run"
                        : "This Run Cannot Start",
                message:
                    this.formatValidationReport(
                        report
                    ),
                tone: "warning",
                confirmLabel: "Review Setup"
            });
            return;
        }

        if (plan.hasCycle) {
            await this.showMessageDialog({
                title: "Execution Path Has a Cycle",
                message:
                    "This execution mode cannot run because the selected path loops back on itself.",
                tone: "warning",
                confirmLabel: "Close"
            });
            return;
        }

        const executionOrder =
            plan.order;

        this.prepareBranchStateForExecutionPlan(
            executionOrder
        );

        this.executionRunId += 1;
        const runId =
            this.executionRunId;

        this.isWorkflowRunning = true;
        this.isWorkflowPaused = false;
        this.currentExecutionMode =
            plan.mode;
        this.currentExecutionWidgetIds =
            new Set(
                executionOrder.map(
                    (item) => item.id
                )
            );
        this.currentExecutionLabel =
            plan.label;
        this.currentRunningWidget = null;

        this.setExecutionConsoleStatus(
            "running"
        );
        this.setExecutionConsoleOpen(true);
        this.updateRunControls();
        this.updateStats();

        const runTitle =
            plan.mode === "workflow"
                ? `Workflow run #${runId} started.`
                : plan.mode === "selected"
                    ? `Single-node run started: ${widget.title}.`
                    : `Run-from-here started at ${widget.title}.`;

        this.appendExecutionLog(
            "info",
            runTitle,
            `${executionOrder.length} node(s) in this run · ${this.connections.length} total connection(s)`
        );

        if (report.warnings.length > 0) {
            this.appendExecutionLog(
                "warning",
                `Run started with ${report.warnings.length} validation warning(s).`
            );

            report.warnings.forEach(
                (warning) => {
                    this.appendExecutionLog(
                        "warning",
                        warning
                    );
                }
            );
        }

        executionOrder.forEach(
            (executionWidget) => {
                executionWidget.runtimeMs = 0;
                executionWidget.memoryKb = 0;
                executionWidget.lastError = "";

                if (
                    executionWidget.type ===
                    "Decision"
                ) {
                    executionWidget.lastDecisionResult =
                        null;
                }

                executionWidget.setStatus(
                    executionWidget.type ===
                        "Start"
                        ? "idle"
                        : "waiting",
                    0,
                    0
                );
            }
        );

        this.updateStats();

        let runFailed = false;

        try {
            for (
                const executionWidget of
                executionOrder
            ) {
                await this.waitWhileWorkflowPaused(
                    runId
                );

                if (
                    runId !==
                    this.executionRunId
                ) {
                    return;
                }

                this.currentRunningWidget =
                    executionWidget;

                if (
                    !this.shouldExecuteWidgetForBranches(
                        executionWidget
                    )
                ) {
                    executionWidget.inputs.forEach(
                        (input) => {
                            this.refreshInputValueFromConnections(
                                executionWidget,
                                input.id,
                                {
                                    activeOnly: true
                                }
                            );
                        }
                    );

                    executionWidget.lastDecisionResult =
                        null;

                    executionWidget.outputs.forEach(
                        (output) => {
                            output.value = "";
                        }
                    );

                    executionWidget.setStatus(
                        "skipped",
                        0,
                        0
                    );

                    this.setWidgetOutgoingBranchStates(
                        executionWidget,
                        {
                            forceInactive: true
                        }
                    );

                    executionWidget.refreshContent();
                    this.updateStats();

                    this.appendExecutionLog(
                        "warning",
                        `${executionWidget.title} skipped.`,
                        "No active branch supplied all required inputs."
                    );

                    if (
                        this.selectedWidget ===
                        executionWidget
                    ) {
                        this.showWidgetProperties(
                            executionWidget
                        );
                    }

                    this.currentRunningWidget =
                        null;
                    continue;
                }

                executionWidget.inputs.forEach(
                    (input) => {
                        this.refreshInputValueFromConnections(
                            executionWidget,
                            input.id,
                            {
                                activeOnly: true
                            }
                        );
                    }
                );

                executionWidget.refreshContent();
                executionWidget.setStatus(
                    "running",
                    0,
                    0
                );
                this.updateStats();

                this.appendExecutionLog(
                    "node",
                    `${executionWidget.title} started.`,
                    this.getWidgetInputLogSummary(
                        executionWidget
                    )
                );

                if (
                    this.selectedWidget ===
                    executionWidget
                ) {
                    this.showWidgetProperties(
                        executionWidget
                    );
                }

                const startedAt =
                    performance.now();

                const delay =
                    Math.max(
                        0,
                        Number(
                            executionWidget.executionDelayMs
                        ) || 0
                    ) +
                    this.getScriptDelay(
                        executionWidget
                    );

                await this.waitForExecution(
                    delay,
                    runId
                );

                await this.waitWhileWorkflowPaused(
                    runId
                );

                let decisionInfo = null;

                if (
                    executionWidget.type ===
                    "Decision"
                ) {
                    const context =
                        this.buildInputContext(
                            executionWidget
                        );

                    decisionInfo =
                        this.executeDecisionBranch(
                            executionWidget,
                            context
                        );
                } else {
                    if (
                        executionWidget.type !==
                            "Start" ||
                        (
                            executionWidget.source &&
                            executionWidget.language !==
                                "Pass-through"
                        )
                    ) {
                        const context =
                            this.buildInputContext(
                                executionWidget
                            );

                        const result =
                            this.interpretWidgetSource(
                                executionWidget,
                                context
                            );

                        this.applyExecutionResult(
                            executionWidget,
                            result
                        );
                    }

                    this.setWidgetOutgoingBranchStates(
                        executionWidget
                    );
                }

                executionWidget.outputs.forEach(
                    (output) => {
                        this.propagateOutputValue(
                            executionWidget,
                            output.id,
                            {
                                activeOnly: true
                            }
                        );
                    }
                );

                const runtime =
                    performance.now() -
                    startedAt;

                const memory =
                    this.estimateWidgetMemory(
                        executionWidget
                    );

                executionWidget.markRunFresh();

                executionWidget.setStatus(
                    "finished",
                    runtime,
                    memory
                );

                executionWidget.refreshContent();
                this.updateStats();

                const branchSummary =
                    decisionInfo
                        ? ` · condition → ${decisionInfo.conditionResult ? "TRUE" : "FALSE"} · branch: ${decisionInfo.selectedOutput.name}`
                        : "";

                this.appendExecutionLog(
                    "success",
                    `${executionWidget.title} finished.`,
                    `${this.getWidgetOutputLogSummary(executionWidget)}${branchSummary} · ${runtime.toFixed(1)} ms · ${memory.toFixed(1)} KB`
                );

                if (
                    this.selectedWidget ===
                    executionWidget
                ) {
                    this.showWidgetProperties(
                        executionWidget
                    );
                }

                this.currentRunningWidget =
                    null;
            }
        } catch (error) {
            if (
                runId !==
                this.executionRunId
            ) {
                return;
            }

            runFailed = true;

            const runningWidget =
                this.currentRunningWidget ||
                executionOrder.find(
                    (executionWidget) =>
                        executionWidget.status ===
                        "running"
                );

            if (runningWidget) {
                runningWidget.setStatus(
                    "error",
                    runningWidget.runtimeMs,
                    this.estimateWidgetMemory(
                        runningWidget
                    ),
                    error.message
                );
            }

            this.setExecutionConsoleStatus(
                "error"
            );
            this.appendExecutionLog(
                "error",
                runningWidget
                    ? `${runningWidget.title} failed.`
                    : "Workflow execution failed.",
                error.message,
                { open: true }
            );

            await this.showMessageDialog({
                title: "Workflow Stopped",
                message:
                    `Workflow execution stopped: ${error.message}`,
                tone: "error",
                confirmLabel: "Close"
            });
        } finally {
            const isCurrentRun =
                runId ===
                this.executionRunId;

            if (isCurrentRun) {
                this.isWorkflowRunning = false;
                this.isWorkflowPaused = false;
                this.currentRunningWidget = null;
                this.releaseWorkflowPauseWaiters();
            }

            this.lastRunRuntimeMs =
                executionOrder.reduce(
                    (total, executionWidget) =>
                        total +
                        (
                            Number(
                                executionWidget.runtimeMs
                            ) || 0
                        ),
                    0
                );

            this.lastRunMemoryKb =
                executionOrder.reduce(
                    (total, executionWidget) =>
                        total +
                        (
                            Number(
                                executionWidget.memoryKb
                            ) || 0
                        ),
                    0
                );

            if (
                isCurrentRun &&
                !runFailed
            ) {
                this.setExecutionConsoleStatus(
                    "finished"
                );

                const finishedTitle =
                    plan.mode === "workflow"
                        ? `Workflow run #${runId} completed.`
                        : plan.mode === "selected"
                            ? `${widget.title} completed.`
                            : `Run from ${widget.title} completed.`;

                this.appendExecutionLog(
                    "success",
                    finishedTitle,
                    `${this.lastRunRuntimeMs.toFixed(1)} ms total runtime · ${this.lastRunMemoryKb.toFixed(1)} KB estimated memory`
                );
            }

            if (isCurrentRun) {
                this.currentExecutionMode =
                    "idle";
                this.currentExecutionWidgetIds =
                    new Set();
                this.currentExecutionLabel = "";
            }

            this.updateRunControls();
            this.updateStats();
            this.updateWorkflowMap();
            this.saveState();

            if (this.selectedWidget) {
                this.showWidgetProperties(
                    this.selectedWidget
                );
            }
        }
    }

    createHistorySnapshot() {
        return JSON.stringify(
            {
                widgets:
                    this.widgets.map(
                        (widget) =>
                            widget.toJSON()
                    ),

                connections:
                    this.connections.map(
                        (connection) =>
                            connection.toJSON()
                    )
            }
        );
    }

    recordHistorySnapshot(snapshot) {
        if (
            this.isApplyingHistory ||
            !snapshot
        ) {
            return;
        }

        const lastSnapshot =
            this.undoStack[
                this.undoStack.length - 1
            ];

        if (
            lastSnapshot !== snapshot
        ) {
            this.undoStack.push(
                snapshot
            );

            if (
                this.undoStack.length >
                this.historyLimit
            ) {
                this.undoStack.shift();
            }
        }

        /*
         * A fresh edit invalidates the previous redo path.
         */
        this.redoStack = [];

        this.updateHistoryButtons();
    }

    recordHistoryState() {
        this.recordHistorySnapshot(
            this.createHistorySnapshot()
        );

        if (
            !this.isWorkflowRunning &&
            this.hasBranchExecutionState
        ) {
            this.clearBranchExecutionState({
                clearDecisionResults: true
            });
        }
    }

    updateHistoryButtons() {
        if (this.undoButton) {
            this.undoButton.disabled =
                this.undoStack.length === 0;
        }

        if (this.redoButton) {
            this.redoButton.disabled =
                this.redoStack.length === 0;
        }
    }

    applyHistorySnapshot(snapshot) {
        if (!snapshot) {
            return;
        }

        let historyData;

        try {
            historyData =
                JSON.parse(snapshot);
        } catch (error) {
            console.error(
                "Could not restore history snapshot:",
                error
            );

            return;
        }

        if (
            !historyData ||
            !Array.isArray(
                historyData.widgets
            ) ||
            !Array.isArray(
                historyData.connections
            )
        ) {
            return;
        }

        clearTimeout(
            this.saveTimer
        );

        this.isApplyingHistory = true;

        try {
            /*
             * History snapshots intentionally omit zoom, pan,
             * and panel state, so Undo/Redo changes workflow
             * content without moving the user's camera.
             */
            this.applyWorkflowData(
                historyData
            );
        } finally {
            this.isApplyingHistory = false;
        }

        /*
         * Undo/Redo leaves selection clear and saves
         * the restored state immediately.
         */
        this.selectWidget(null);

        this.saveState();
        this.updateHistoryButtons();
    }

    undo() {
        if (
            this.undoStack.length === 0
        ) {
            return;
        }

        const currentSnapshot =
            this.createHistorySnapshot();

        const previousSnapshot =
            this.undoStack.pop();

        this.redoStack.push(
            currentSnapshot
        );

        if (
            this.redoStack.length >
            this.historyLimit
        ) {
            this.redoStack.shift();
        }

        this.applyHistorySnapshot(
            previousSnapshot
        );
    }

    redo() {
        if (
            this.redoStack.length === 0
        ) {
            return;
        }

        const currentSnapshot =
            this.createHistorySnapshot();

        const nextSnapshot =
            this.redoStack.pop();

        this.undoStack.push(
            currentSnapshot
        );

        if (
            this.undoStack.length >
            this.historyLimit
        ) {
            this.undoStack.shift();
        }

        this.applyHistorySnapshot(
            nextSnapshot
        );
    }

    saveState() {
        try {
            const workflowData =
                this.getWorkflowData();

            localStorage.setItem(
                this.storageKey,
                JSON.stringify(
                    workflowData
                )
            );
        } catch (error) {
            console.error(
                "Could not save workflow:",
                error
            );
        }
    }

    scheduleSave() {
        if (this.isApplyingHistory) {
            return;
        }

        clearTimeout(
            this.saveTimer
        );

        this.saveTimer =
            setTimeout(
                () => {
                    this.saveState();
                },
                250
            );
    }

    loadState() {
        const savedState =
            localStorage.getItem(
                this.storageKey
            );

        if (!savedState) {
            return false;
        }

        try {
            const workflowData =
                JSON.parse(savedState);

            this.applyWorkflowData(
                workflowData
            );

            return true;
        } catch (error) {
            console.error(
                "Saved workflow is invalid:",
                error
            );

            localStorage.removeItem(
                this.storageKey
            );

            return false;
        }
    }

    getWorkflowData() {
        return {
            version: 2,

            workspaceWidth:
                this.workspaceWidth,

            workspaceHeight:
                this.workspaceHeight,

            zoom:
                this.zoom,

            panX:
                this.panX,

            panY:
                this.panY,

            leftPanelWidth:
                this.leftPanelWidth,

            rightPanelWidth:
                this.rightPanelWidth,

            widgets: this.widgets.map(
                (widget) => {
                    return widget.toJSON();
                }
            ),

            connections:
                this.connections.map(
                    (connection) => {
                        return connection.toJSON();
                    }
                )
        };
    }

    exportWorkflow() {
        const workflowData =
            this.getWorkflowData();

        const jsonText =
            JSON.stringify(
                workflowData,
                null,
                2
            );

        const fileBlob =
            new Blob(
                [jsonText],
                {
                    type: "application/json"
                }
            );

        const downloadUrl =
            URL.createObjectURL(
                fileBlob
            );

        const downloadLink =
            document.createElement("a");

        downloadLink.href =
            downloadUrl;

        downloadLink.download =
            "workflow.json";

        document.body.appendChild(
            downloadLink
        );

        downloadLink.click();

        downloadLink.remove();

        URL.revokeObjectURL(
            downloadUrl
        );
    }

    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();

            this.contextMenu = null;
        }
    }

    showAppDialog({
        title = "Workflow Builder",
        message = "",
        mode = "message",
        tone = "info",
        value = "",
        placeholder = "",
        confirmLabel = "OK",
        cancelLabel = "Cancel",
        danger = false
    } = {}) {
        /*
         * Replaces browser alert/confirm/prompt windows with a
         * centered dialog that matches the workflow editor.
         */
        if (this.activeDialog) {
            this.activeDialog.close(null);
        }

        return new Promise(
            (resolve) => {
                const overlay =
                    document.createElement("div");
                overlay.className =
                    "app-dialog-overlay";

                const dialog =
                    document.createElement("section");
                dialog.className =
                    `app-dialog app-dialog-${tone}`;
                dialog.setAttribute("role", "dialog");
                dialog.setAttribute("aria-modal", "true");

                const titleId =
                    `app-dialog-title-${Date.now()}-${Math.random()
                        .toString(16)
                        .slice(2)}`;
                dialog.setAttribute("aria-labelledby", titleId);

                const header =
                    document.createElement("div");
                header.className =
                    "app-dialog-header";

                const toneIcon =
                    document.createElement("span");
                toneIcon.className =
                    "app-dialog-icon";
                toneIcon.setAttribute("aria-hidden", "true");

                const toneIcons = {
                    info: "i",
                    success: "✓",
                    warning: "!",
                    error: "!"
                };
                toneIcon.textContent =
                    toneIcons[tone] || "i";

                const heading =
                    document.createElement("h2");
                heading.id = titleId;
                heading.className =
                    "app-dialog-title";
                heading.textContent = title;

                header.appendChild(toneIcon);
                header.appendChild(heading);

                const body =
                    document.createElement("div");
                body.className =
                    "app-dialog-body";

                const messageElement =
                    document.createElement("div");
                messageElement.className =
                    "app-dialog-message";
                messageElement.textContent =
                    String(message || "");
                body.appendChild(messageElement);

                let promptInput = null;

                if (mode === "prompt") {
                    promptInput =
                        document.createElement("input");
                    promptInput.type = "text";
                    promptInput.className =
                        "app-dialog-input";
                    promptInput.value =
                        String(value ?? "");
                    promptInput.placeholder = placeholder;
                    body.appendChild(promptInput);
                }

                const footer =
                    document.createElement("div");
                footer.className =
                    "app-dialog-actions";

                let finished = false;

                const close = (result) => {
                    if (finished) {
                        return;
                    }

                    finished = true;

                    document.removeEventListener(
                        "keydown",
                        keyHandler,
                        true
                    );

                    overlay.remove();

                    if (
                        this.activeDialog &&
                        this.activeDialog.overlay === overlay
                    ) {
                        this.activeDialog = null;
                    }

                    resolve(result);
                };

                const keyHandler = (event) => {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        close(
                            mode === "message"
                                ? true
                                : null
                        );
                        return;
                    }

                    if (event.key === "Enter") {
                        event.preventDefault();
                        event.stopPropagation();

                        if (
                            mode === "prompt" &&
                            promptInput
                        ) {
                            close(promptInput.value);
                        } else {
                            close(true);
                        }
                    }
                };

                if (
                    mode === "confirm" ||
                    mode === "prompt"
                ) {
                    const cancelButton =
                        document.createElement("button");
                    cancelButton.type = "button";
                    cancelButton.className =
                        "app-dialog-button app-dialog-button-secondary";
                    cancelButton.textContent = cancelLabel;
                    cancelButton.addEventListener(
                        "click",
                        () => close(null)
                    );
                    footer.appendChild(cancelButton);
                }

                const confirmButton =
                    document.createElement("button");
                confirmButton.type = "button";
                confirmButton.className =
                    danger
                        ? "app-dialog-button app-dialog-button-danger"
                        : "app-dialog-button app-dialog-button-primary";
                confirmButton.textContent = confirmLabel;
                confirmButton.addEventListener(
                    "click",
                    () => {
                        if (
                            mode === "prompt" &&
                            promptInput
                        ) {
                            close(promptInput.value);
                        } else {
                            close(true);
                        }
                    }
                );
                footer.appendChild(confirmButton);

                dialog.appendChild(header);
                dialog.appendChild(body);
                dialog.appendChild(footer);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                overlay.addEventListener(
                    "pointerdown",
                    (event) => {
                        /* Informational dialogs may close on backdrop click. */
                        if (
                            event.target === overlay &&
                            mode === "message"
                        ) {
                            close(true);
                        }
                    }
                );

                document.addEventListener(
                    "keydown",
                    keyHandler,
                    true
                );

                this.activeDialog = {
                    overlay,
                    close
                };

                requestAnimationFrame(
                    () => {
                        dialog.classList.add("visible");

                        if (promptInput) {
                            promptInput.focus();
                            promptInput.select();
                        } else {
                            confirmButton.focus();
                        }
                    }
                );
            }
        );
    }

    showMessageDialog(options = {}) {
        return this.showAppDialog({
            ...options,
            mode: "message"
        });
    }

    async showConfirmDialog(options = {}) {
        const result =
            await this.showAppDialog({
                ...options,
                mode: "confirm"
            });

        return result === true;
    }

    showPromptDialog(options = {}) {
        return this.showAppDialog({
            ...options,
            mode: "prompt"
        });
    }

    createContextMenuButton(
        label,
        action,
        options = {}
    ) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.textContent = label;

        if (options.danger) {
            button.classList.add(
                "context-menu-danger"
            );
        }

        if (options.disabled) {
            button.disabled = true;
        }

        if (options.title) {
            button.title = options.title;
        }

        button.addEventListener(
            "click",
            () => {
                if (button.disabled) {
                    return;
                }

                this.hideContextMenu();

                action();
            }
        );

        return button;
    }

    createContextMenuDivider() {
        const divider =
            document.createElement("div");

        divider.className =
            "context-menu-divider";

        return divider;
    }

    positionContextMenu(
        menu,
        clientX,
        clientY
    ) {
        const edgePadding = 8;

        const menuRect =
            menu.getBoundingClientRect();

        const maximumLeft =
            Math.max(
                edgePadding,
                window.innerWidth -
                    menuRect.width -
                    edgePadding
            );

        const maximumTop =
            Math.max(
                edgePadding,
                window.innerHeight -
                    menuRect.height -
                    edgePadding
            );

        const left =
            Math.max(
                edgePadding,
                Math.min(
                    clientX,
                    maximumLeft
                )
            );

        const top =
            Math.max(
                edgePadding,
                Math.min(
                    clientY,
                    maximumTop
                )
            );

        menu.style.left =
            `${left}px`;

        menu.style.top =
            `${top}px`;
    }

    async renameWidget(widget) {
        if (
            !widget ||
            !this.widgets.includes(widget)
        ) {
            return;
        }

        const enteredTitle =
            await this.showPromptDialog({
                title: "Rename Widget",
                message:
                    "Enter a new name for this widget.",
                value: widget.title,
                placeholder: "Widget name",
                confirmLabel: "Rename"
            });

        if (enteredTitle === null) {
            return;
        }

        const nextTitle =
            enteredTitle.trim();

        if (
            nextTitle === "" ||
            nextTitle === widget.title
        ) {
            return;
        }

        this.recordHistoryState();

        widget.setTitle(
            nextTitle
        );

        if (
            this.selectedWidget ===
            widget
        ) {
            this.showWidgetProperties(
                widget
            );
        }

        this.updateStats();
    }

    duplicateWidget(widget) {
        if (
            !widget ||
            !this.widgets.includes(widget)
        ) {
            return null;
        }

        this.recordHistoryState();

        const id =
            `widget-${this.nextWidgetNumber}`;

        this.nextWidgetNumber += 1;

        const duplicateOffset = 30;

        const width =
            widget.element
                ? widget.element.offsetWidth
                : 210;

        const height =
            widget.element
                ? widget.element.offsetHeight
                : 120;

        const duplicateX =
            Math.max(
                0,
                Math.min(
                    this.workspaceWidth - width,
                    widget.x + duplicateOffset
                )
            );

        const duplicateY =
            Math.max(
                0,
                Math.min(
                    this.workspaceHeight - height,
                    widget.y + duplicateOffset
                )
            );

        const duplicate =
            new Widget(
                this,
                id,
                `${widget.title} Copy`,
                widget.type,
                duplicateX,
                duplicateY
            );

        const duplicateData =
            widget.toJSON();

        duplicateData.status =
            widget.type === "Start"
                ? "idle"
                : "waiting";

        duplicateData.runtimeMs = 0;
        duplicateData.memoryKb = 0;
        duplicateData.lastError = "";

        duplicate.applyJSON(
            duplicateData
        );

        this.addWidget(duplicate);
        this.selectWidget(duplicate);

        return duplicate;
    }

    async disconnectAllConnections(widget) {
        if (
            !widget ||
            !this.widgets.includes(widget)
        ) {
            return;
        }

        const attachedConnections =
            this.connections.filter(
                (connection) =>
                    connection.sourceWidget ===
                        widget ||
                    connection.targetWidget ===
                        widget
            );

        if (
            attachedConnections.length === 0
        ) {
            return;
        }

        const connectionWord =
            attachedConnections.length === 1
                ? "connection"
                : "connections";

        const confirmed =
            await this.showConfirmDialog({
                title: "Disconnect All",
                message:
                    `Disconnect all ${attachedConnections.length} ${connectionWord} from "${widget.title}"?`,
                confirmLabel: "Disconnect",
                danger: true
            });

        if (!confirmed) {
            return;
        }

        this.recordHistoryState();

        attachedConnections.forEach(
            (connection) => {
                this.removeConnection(
                    connection,
                    false
                );
            }
        );

        this.selectWidget(widget);
        this.updateWorkflowMap();
        this.scheduleSave();
    }

    showWidgetContextMenu(
        widget,
        clientX,
        clientY
    ) {
        this.hideContextMenu();

        this.selectWidget(widget);

        const menu =
            document.createElement("div");

        menu.className =
            "widget-context-menu enhanced-context-menu";

        const attachedConnectionCount =
            this.connections.filter(
                (connection) =>
                    connection.sourceWidget ===
                        widget ||
                    connection.targetWidget ===
                        widget
            ).length;

        const highestZIndex =
            this.widgets.reduce(
                (highest, currentWidget) =>
                    Math.max(
                        highest,
                        this.getWidgetZIndex(
                            currentWidget
                        )
                    ),
                2
            );

        const lowestZIndex =
            this.widgets.reduce(
                (lowest, currentWidget) =>
                    Math.min(
                        lowest,
                        this.getWidgetZIndex(
                            currentWidget
                        )
                    ),
                Number.POSITIVE_INFINITY
            );

        menu.appendChild(
            this.createContextMenuButton(
                "Properties",
                () => {
                    this.openWidgetProperties(
                        widget
                    );
                }
            )
        );

        menu.appendChild(
            this.createContextMenuButton(
                "Rename",
                () => {
                    this.renameWidget(
                        widget
                    );
                }
            )
        );

        menu.appendChild(
            this.createContextMenuButton(
                "Duplicate",
                () => {
                    this.duplicateWidget(
                        widget
                    );
                }
            )
        );

        menu.appendChild(
            this.createContextMenuDivider()
        );

        menu.appendChild(
            this.createContextMenuButton(
                "Bring to Front",
                () => {
                    this.bringWidgetToFront(
                        widget,
                        true
                    );
                },
                {
                    disabled:
                        this.getWidgetZIndex(widget) >=
                        highestZIndex,
                    title:
                        "Place this widget above all other widgets"
                }
            )
        );

        menu.appendChild(
            this.createContextMenuButton(
                "Send to Back",
                () => {
                    this.sendWidgetToBack(
                        widget,
                        true
                    );
                },
                {
                    disabled:
                        this.getWidgetZIndex(widget) <=
                        lowestZIndex,
                    title:
                        "Place this widget behind all other widgets"
                }
            )
        );

        menu.appendChild(
            this.createContextMenuButton(
                attachedConnectionCount > 0
                    ? `Disconnect All (${attachedConnectionCount})`
                    : "Disconnect All",
                () => {
                    this.disconnectAllConnections(
                        widget
                    );
                },
                {
                    disabled:
                        attachedConnectionCount === 0,
                    title:
                        attachedConnectionCount === 0
                            ? "This widget has no connections"
                            : "Remove every connection attached to this widget"
                }
            )
        );

        menu.appendChild(
            this.createContextMenuDivider()
        );

        menu.appendChild(
            this.createContextMenuButton(
                "Delete",
                async () => {
                    const confirmed =
                        await this.showConfirmDialog({
                            title: "Delete Widget",
                            message:
                                `Delete "${widget.title}"?`,
                            confirmLabel: "Delete",
                            danger: true
                        });

                    if (confirmed) {
                        this.removeWidget(
                            widget
                        );
                    }
                },
                {
                    danger: true
                }
            )
        );

        document.body.appendChild(
            menu
        );

        this.contextMenu = menu;

        this.positionContextMenu(
            menu,
            clientX,
            clientY
        );
    }

    showConnectionContextMenu(
        connection,
        clientX,
        clientY
    ) {
        this.hideContextMenu();

        this.selectConnection(
            connection
        );

        const menu =
            document.createElement("div");

        menu.className =
            "widget-context-menu enhanced-context-menu";

        menu.appendChild(
            this.createContextMenuButton(
                "Properties",
                () => {
                    this.selectConnection(
                        connection
                    );

                    if (
                        !this.rightPanelVisible
                    ) {
                        this.togglePanel(
                            "right"
                        );
                    }
                }
            )
        );

        menu.appendChild(
            this.createContextMenuButton(
                "Select Source Widget",
                () => {
                    this.selectWidget(
                        connection.sourceWidget
                    );
                }
            )
        );

        menu.appendChild(
            this.createContextMenuButton(
                "Select Target Widget",
                () => {
                    this.selectWidget(
                        connection.targetWidget
                    );
                }
            )
        );

        menu.appendChild(
            this.createContextMenuDivider()
        );

        menu.appendChild(
            this.createContextMenuButton(
                "Delete Connection",
                async () => {
                    const confirmed =
                        await this.showConfirmDialog({
                            title: "Delete Connection",
                            message:
                                `Delete connection from "${connection.sourceWidget.title}" to "${connection.targetWidget.title}"?`,
                            confirmLabel: "Delete",
                            danger: true
                        });

                    if (confirmed) {
                        this.removeConnection(
                            connection
                        );
                    }
                },
                {
                    danger: true
                }
            )
        );

        document.body.appendChild(
            menu
        );

        this.contextMenu = menu;

        this.positionContextMenu(
            menu,
            clientX,
            clientY
        );
    }

    openWidgetProperties(widget) {
        this.selectWidget(widget);

        if (!this.rightPanelVisible) {
            this.togglePanel("right");
        }
    }

    startConnection(
        sourceWidget,
        event,
        sourcePortId = null
    ) {
        if (event.button !== 0) {
            return;
        }

        const sourcePort =
            sourceWidget &&
            sourceWidget.getOutputById(
                sourcePortId ||
                (
                    sourceWidget.outputs[0]
                        ? sourceWidget.outputs[0].id
                        : null
                )
            );

        if (!sourcePort) {
            return;
        }

        this.cancelConnectionDrag();

        this.connectionSourceWidget =
            sourceWidget;

        this.connectionSourcePortId =
            sourcePort.id;

        const svgNamespace =
            "http://www.w3.org/2000/svg";

        const previewPath =
            document.createElementNS(
                svgNamespace,
                "path"
            );

        previewPath.classList.add(
            "workflow-connection",
            "connection-preview"
        );

        this.connectionLayer.appendChild(
            previewPath
        );

        this.connectionPreviewElement =
            previewPath;

        this.updateConnectionPreview(
            event.clientX,
            event.clientY
        );

        this.connectionMoveHandler =
            (moveEvent) => {
                this.updateConnectionPreview(
                    moveEvent.clientX,
                    moveEvent.clientY
                );
            };

        this.connectionEndHandler =
            (upEvent) => {
                this.finishConnectionDrag(
                    upEvent
                );
            };

        this.connectionCancelHandler =
            () => {
                this.cancelConnectionDrag();
            };

        window.addEventListener(
            "pointermove",
            this.connectionMoveHandler
        );

        window.addEventListener(
            "pointerup",
            this.connectionEndHandler
        );

        window.addEventListener(
            "pointercancel",
            this.connectionCancelHandler
        );
    }

    updateConnectionPreview(
        clientX,
        clientY
    ) {
        if (
            !this.connectionSourceWidget ||
            !this.connectionSourcePortId ||
            !this.connectionPreviewElement
        ) {
            return;
        }

        const sourcePoint =
            this.connectionSourceWidget
                .getOutputPortPosition(
                    this.connectionSourcePortId
                );

        const nearestInputPort =
            this.findNearestInputPort(
                clientX,
                clientY,
                this.connectionSourceWidget
            );

        let targetPoint;

        if (nearestInputPort) {
            const rect =
                nearestInputPort
                    .getBoundingClientRect();

            targetPoint =
                this.screenToWorkspace(
                    rect.left +
                        rect.width / 2,
                    rect.top +
                        rect.height / 2
                );

            targetPoint.x -= 8;
        } else {
            targetPoint =
                this.screenToWorkspace(
                    clientX,
                    clientY
                );
        }

        const pathData =
            Connection.createPath(
                sourcePoint,
                targetPoint
            );

        this.connectionPreviewElement
            .setAttribute(
                "d",
                pathData
            );

        document
            .querySelectorAll(
                ".input-port.connection-target, .input-port.connection-target-convertible, .input-port.connection-target-incompatible"
            )
            .forEach((port) => {
                port.classList.remove(
                    "connection-target",
                    "connection-target-convertible",
                    "connection-target-incompatible"
                );
            });

        this.connectionPreviewElement.classList.remove(
            "connection-preview-convertible",
            "connection-preview-incompatible"
        );

        if (nearestInputPort) {
            const targetWidget =
                this.getWidgetFromPort(
                    nearestInputPort
                );

            const targetPortId =
                this.getPortIdFromPort(
                    nearestInputPort
                );

            const sourcePort =
                this.connectionSourceWidget
                    .getOutputById(
                        this.connectionSourcePortId
                    );

            const targetPort =
                targetWidget && targetPortId
                    ? targetWidget.getInputById(
                        targetPortId
                    )
                    : null;

            const compatibility =
                this.getPortTypeCompatibility(
                    sourcePort,
                    targetPort
                );

            if (!compatibility.compatible) {
                nearestInputPort.classList.add(
                    "connection-target-incompatible"
                );
                this.connectionPreviewElement.classList.add(
                    "connection-preview-incompatible"
                );
            } else if (
                compatibility.level ===
                "convertible"
            ) {
                nearestInputPort.classList.add(
                    "connection-target-convertible"
                );
                this.connectionPreviewElement.classList.add(
                    "connection-preview-convertible"
                );
            } else {
                nearestInputPort.classList.add(
                    "connection-target"
                );
            }
        }
    }

    getWidgetFromPort(portElement) {
        if (!portElement) {
            return null;
        }

        const widgetElement =
            portElement.closest(".widget");

        if (!widgetElement) {
            return null;
        }

        const widgetId =
            widgetElement.dataset.widgetId;

        return (
            this.widgets.find(
                (widget) =>
                    widget.id === widgetId
            ) || null
        );
    }

    getPortIdFromPort(portElement) {
        if (!portElement) {
            return null;
        }

        return (
            portElement.dataset.portId ||
            null
        );
    }

    findNearestInputPort(
        clientX,
        clientY,
        sourceWidget,
        maxDistance = 30
    ) {
        const inputPorts =
            this.workspace.querySelectorAll(
                ".input-port"
            );

        let nearestPort = null;
        let nearestDistance =
            maxDistance;

        inputPorts.forEach(
            (port) => {
                const targetWidget =
                    this.getWidgetFromPort(
                        port
                    );

                const targetPortId =
                    this.getPortIdFromPort(
                        port
                    );

                if (
                    !targetWidget ||
                    !targetPortId ||
                    targetWidget ===
                        sourceWidget ||
                    !targetWidget.getInputById(
                        targetPortId
                    )
                ) {
                    return;
                }

                const rect =
                    port.getBoundingClientRect();

                const portX =
                    rect.left +
                    rect.width / 2;

                const portY =
                    rect.top +
                    rect.height / 2;

                const deltaX =
                    clientX - portX;

                const deltaY =
                    clientY - portY;

                const distance =
                    Math.sqrt(
                        deltaX * deltaX +
                        deltaY * deltaY
                    );

                if (
                    distance <
                    nearestDistance
                ) {
                    nearestDistance =
                        distance;

                    nearestPort = port;
                }
            }
        );

        return nearestPort;
    }

    finishConnectionDrag(event) {
        const sourceWidget =
            this.connectionSourceWidget;

        const sourcePortId =
            this.connectionSourcePortId;

        if (
            !sourceWidget ||
            !sourcePortId
        ) {
            this.cancelConnectionDrag();
            return;
        }

        try {
            const inputPort =
                this.workspace.querySelector(
                    ".input-port.connection-target, .input-port.connection-target-convertible, .input-port.connection-target-incompatible"
                );

            if (!inputPort) {
                return;
            }

            const targetWidget =
                this.getWidgetFromPort(
                    inputPort
                );

            const targetPortId =
                this.getPortIdFromPort(
                    inputPort
                );

            if (
                !targetWidget ||
                !targetPortId ||
                targetWidget === sourceWidget ||
                !targetWidget.getInputById(
                    targetPortId
                )
            ) {
                return;
            }

            const sourcePort =
                sourceWidget.getOutputById(
                    sourcePortId
                );

            if (!sourcePort) {
                return;
            }

            const targetPort =
                targetWidget.getInputById(
                    targetPortId
                );

            const compatibility =
                this.getPortTypeCompatibility(
                    sourcePort,
                    targetPort
                );

            if (!compatibility.compatible) {
                void this.showMessageDialog({
                    title: "Incompatible Port Types",
                    message:
                        `${sourceWidget.title} / ${sourcePort.name} (${compatibility.sourceType}) cannot connect to ${targetWidget.title} / ${targetPort ? targetPort.name : "input"} (${compatibility.targetType}).`,
                    tone: "warning",
                    confirmLabel: "Close"
                });

                return;
            }

            const duplicateConnection =
                this.connections.find(
                    (connection) =>
                        connection.targetWidget ===
                            targetWidget &&
                        connection.targetPortId ===
                            targetPortId &&
                        connection.sourceWidget ===
                            sourceWidget &&
                        connection.sourcePortId ===
                            sourcePortId
                );

            if (duplicateConnection) {
                return;
            }

            this.recordHistoryState();

            this.addConnection(
                sourceWidget,
                targetWidget,
                sourcePortId,
                targetPortId
            );

            this.refreshInputValueFromConnections(
                targetWidget,
                targetPortId
            );

            if (
                this.selectedWidget ===
                targetWidget
            ) {
                this.showWidgetProperties(
                    targetWidget
                );
            }
        } finally {
            this.cancelConnectionDrag();
        }
    }

    addConnection(
        sourceWidget,
        targetWidget,
        sourcePortId = null,
        targetPortId = null
    ) {
        if (
            !sourceWidget ||
            !targetWidget ||
            sourceWidget === targetWidget
        ) {
            return null;
        }

        const resolvedSourcePortId =
            sourcePortId ||
            (
                sourceWidget.outputs[0]
                    ? sourceWidget.outputs[0].id
                    : null
            );

        const resolvedTargetPortId =
            targetPortId ||
            (
                targetWidget.inputs[0]
                    ? targetWidget.inputs[0].id
                    : null
            );

        if (
            !resolvedSourcePortId ||
            !resolvedTargetPortId ||
            !sourceWidget.getOutputById(
                resolvedSourcePortId
            ) ||
            !targetWidget.getInputById(
                resolvedTargetPortId
            )
        ) {
            return null;
        }

        const duplicate =
            this.connections.find(
                (connection) =>
                    connection.sourceWidget ===
                        sourceWidget &&
                    connection.targetWidget ===
                        targetWidget &&
                    connection.sourcePortId ===
                        resolvedSourcePortId &&
                    connection.targetPortId ===
                        resolvedTargetPortId
            );

        if (duplicate) {
            return duplicate;
        }

        const id =
            `connection-${this.nextConnectionNumber}`;

        this.nextConnectionNumber += 1;

        const connection =
            new Connection(
                this,
                id,
                sourceWidget,
                targetWidget,
                resolvedSourcePortId,
                resolvedTargetPortId
            );

        const connectionElement =
            connection.render();

        this.connectionLayer.appendChild(
            connectionElement
        );

        this.connections.push(
            connection
        );

        if (
            typeof targetWidget.markStale ===
            "function"
        ) {
            targetWidget.markStale();
        }

        if (!this.isWorkflowRunning) {
            this.clearBranchExecutionState({
                clearDecisionResults: true
            });
        }

        this.updateConnectionTypeState(
            connection
        );
        this.updateWorkflowMap();
        this.scheduleSave();

        return connection;
    }

    cancelConnectionDrag() {
        if (
            this.connectionPreviewElement
        ) {
            this.connectionPreviewElement.remove();
        }

        this.connectionPreviewElement =
            null;

        this.connectionSourceWidget =
            null;

        this.connectionSourcePortId =
            null;

        document
            .querySelectorAll(
                ".input-port.connection-target, .input-port.connection-target-convertible, .input-port.connection-target-incompatible"
            )
            .forEach((port) => {
                port.classList.remove(
                    "connection-target",
                    "connection-target-convertible",
                    "connection-target-incompatible"
                );
            });

        if (this.connectionMoveHandler) {
            window.removeEventListener(
                "pointermove",
                this.connectionMoveHandler
            );
        }

        if (this.connectionEndHandler) {
            window.removeEventListener(
                "pointerup",
                this.connectionEndHandler
            );
        }

        if (
            this.connectionCancelHandler
        ) {
            window.removeEventListener(
                "pointercancel",
                this.connectionCancelHandler
            );
        }

        this.connectionMoveHandler = null;
        this.connectionEndHandler = null;
        this.connectionCancelHandler = null;
    }

    updateConnectionsForWidget(
        widget
    ) {
        this.connections.forEach(
            (connection) => {
                if (
                    connection.sourceWidget ===
                        widget ||
                    connection.targetWidget ===
                        widget
                ) {
                    connection.update();
                }
            }
        );
    }

    removeConnection(
        connection,
        recordHistory = true
    ) {
        const connectionIndex =
            this.connections.indexOf(
                connection
            );

        if (connectionIndex === -1) {
            return;
        }

        if (recordHistory) {
            this.recordHistoryState();
        }

        const targetWidget =
            connection.targetWidget;

        const targetPortId =
            connection.targetPortId;

        this.hoverPeekConnections =
            this.hoverPeekConnections.filter(
                (currentConnection) =>
                    currentConnection !==
                    connection
            );

        this.updateConnectionPeek();

        const wasSelected =
            this.selectedConnection ===
            connection;

        if (wasSelected) {
            this.selectedConnection = null;
        }

        connection.remove();

        this.connections.splice(
            connectionIndex,
            1
        );

        this.branchConnectionStates.delete(
            connection.id
        );

        if (!this.isWorkflowRunning) {
            this.clearBranchExecutionState({
                clearDecisionResults: true
            });
        }

        const targetInput =
            targetWidget &&
            targetWidget.getInputById(
                targetPortId
            );

        if (targetInput) {
            this.refreshInputValueFromConnections(
                targetWidget,
                targetPortId
            );

            if (
                typeof targetWidget.markStale ===
                "function"
            ) {
                targetWidget.markStale();
            }
        }

        if (wasSelected) {
            this.showNoSelectionMessage();
        }

        if (
            this.selectedWidget ===
            targetWidget
        ) {
            this.showWidgetProperties(
                targetWidget
            );
        }

        this.updateStats();
        this.updateWorkflowMap();
        this.scheduleSave();
    }

    removeConnectionsForWidget(
        widget
    ) {
        const connectionsToRemove =
            this.connections.filter(
                (connection) => {
                    return (
                        connection.sourceWidget ===
                            widget ||
                        connection.targetWidget ===
                            widget
                    );
                }
            );

        connectionsToRemove.forEach(
            (connection) => {
                this.removeConnection(
                    connection,
                    false
                );
            }
        );
    }

    clearConnections() {
        this.connections.forEach(
            (connection) => {
                connection.remove();
            }
        );

        this.connections = [];

        this.branchConnectionStates.clear();
        this.hasBranchExecutionState = false;

        this.nextConnectionNumber = 1;

        this.cancelConnectionDrag();
    }

}