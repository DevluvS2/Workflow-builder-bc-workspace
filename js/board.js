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
        this.executionRunId = 0;
        this.lastRunRuntimeMs = 0;
        this.lastRunMemoryKb = 0;
        this.lastValidationReport = {
            valid: true,
            errors: [],
            warnings: []
        };

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

        const workflowButton = document.createElement("button");
        workflowButton.className = "dropdown-button";
        workflowButton.textContent = "Workflow";

        const workflowDropdown = document.createElement("div");
        workflowDropdown.className = "dropdown-content workflow-dropdown-content";

        const runMenuItem = document.createElement("button");
        runMenuItem.textContent = "▶  Run Workflow   Ctrl+Enter";
        runMenuItem.addEventListener("click", () => {
            this.runWorkflow();
        });

        const validateMenuItem = document.createElement("button");
        validateMenuItem.textContent = "✓  Validate Workflow";
        validateMenuItem.addEventListener("click", () => {
            this.validateWorkflow(true);
        });

        const stopMenuItem = document.createElement("button");
        stopMenuItem.textContent = "■  Stop Run";
        stopMenuItem.addEventListener("click", () => {
            this.stopWorkflowRun();
        });

        const workflowDivider = document.createElement("div");
        workflowDivider.className = "dropdown-divider";

        const resetStatusMenuItem = document.createElement("button");
        resetStatusMenuItem.textContent = "Reset Status Labels";
        resetStatusMenuItem.addEventListener("click", () => {
            this.resetWorkflowStatuses();
        });

        workflowDropdown.appendChild(runMenuItem);
        workflowDropdown.appendChild(validateMenuItem);
        workflowDropdown.appendChild(stopMenuItem);
        workflowDropdown.appendChild(workflowDivider);
        workflowDropdown.appendChild(resetStatusMenuItem);
        workflowMenu.appendChild(workflowButton);
        workflowMenu.appendChild(workflowDropdown);

        this.runWorkflowMenuItem = runMenuItem;
        this.stopWorkflowMenuItem = stopMenuItem;


        /* =============================
         * Help
         * ============================= */
        const helpButton = document.createElement("button");
        helpButton.textContent = "Help";
        helpButton.addEventListener("click", () => {
            this.showShortcutHelp();
        });


        /* =============================
         * Undo / Redo icon toolbar
         * ============================= */
        const historyControls = document.createElement("div");
        historyControls.className = "history-controls";

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
         * Execution Console toolbar button
         * ============================= */
        const consoleButton =
            document.createElement("button");
        consoleButton.className =
            "history-icon-button console-toolbar-button";
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
        menuBar.appendChild(helpButton);
        menuBar.appendChild(historyControls);
        menuBar.appendChild(consoleButton);
        menuBar.appendChild(spacer);
        menuBar.appendChild(zoomDisplay);

        this.updateHistoryButtons();

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
        inputPortId
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

        const incomingConnections =
            this.getIncomingConnections(
                widget,
                inputPortId
            );

        if (
            incomingConnections.length === 0
        ) {
            input.value =
                input.manualValue;

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

                    return sourceOutput
                        ? sourceOutput.value
                        : "";
                }
            );

        /*
         * Backward-compatible behavior:
         * one source => scalar value
         * multiple sources => ordered array
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
        outputPortId
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
        ).forEach(
            (connection) => {
                const targetInput =
                    connection.targetWidget
                        .getInputById(
                            connection.targetPortId
                        );

                if (targetInput) {
                    this.refreshInputValueFromConnections(
                        connection.targetWidget,
                        connection.targetPortId
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

        this.propertiesPanelContent.innerHTML = "";

        /* =============================
         * General
         * ============================= */
        const general =
            this.createPropertiesSection(
                "General"
            );

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

                                option.textContent =
                                    `${alreadyConnected ? "✓ " : ""}${sourceWidget.title} / ${output.name}`;

                                option.disabled =
                                    alreadyConnected;

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

                if (inputMissingRequiredValue) {
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
                            sourceText.textContent =
                                `${index + 1}. ${connection.sourceWidget.title} / ${sourceOutput ? sourceOutput.name : "output"}`;

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
                    "Manual input value";
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
                            input.value =
                                manualValue.value;
                        }

                        widget.refreshContent();
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
                        output.value =
                            valueInput.value;
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

                outputMeta.textContent =
                    `${connectionCount} downstream connection${connectionCount === 1 ? "" : "s"}`;

                const removeButton =
                    document.createElement(
                        "button"
                    );
                removeButton.type = "button";
                removeButton.className =
                    "io-remove-button";
                removeButton.textContent =
                    "Remove";

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
         * Script / transformation
         * ============================= */
        const scriptSection =
            this.createPropertiesSection(
                "Script",
                "Runs in the browser-safe workflow simulator. Bash, Python, and JavaScript syntax is interpreted locally; no operating-system commands are executed."
            );

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
                " Show status label on widget"
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
            showStatusLabel
        );
        statusSection.body.appendChild(
            metricsGrid
        );
        this.propertiesPanelContent.appendChild(
            statusSection.section
        );


        /* =============================
         * Actions
         * ============================= */
        const actions =
            document.createElement("div");
        actions.className =
            "property-actions stacked-property-actions";

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

        const runButton =
            document.createElement("button");
        runButton.type = "button";
        runButton.className =
            "primary-property-button";
        runButton.textContent =
            "▶ Run Workflow";
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
        actions.appendChild(runButton);
        actions.appendChild(deleteButton);
        this.propertiesPanelContent.appendChild(
            actions
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

        const details = [
            [
                "From",
                `${connection.sourceWidget.title} / ${sourcePort ? sourcePort.name : "output"}`
            ],
            [
                "To",
                `${connection.targetWidget.title} / ${targetPort ? targetPort.name : "input"}`
            ],
            [
                "Current value",
                Widget.formatValue(
                    sourcePort
                        ? sourcePort.value
                        : ""
                )
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
            this.positionElement.textContent =
                "Workflow: running";
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

    showShortcutHelp() {
        return this.showMessageDialog({
            title: "Keyboard Shortcuts",
            message:
                "Ctrl+Z — Undo\n" +
                "Ctrl+Y / Ctrl+Shift+Z — Redo\n" +
                "Ctrl+D — Duplicate selected widget\n" +
                "Ctrl+S — Export workflow JSON\n" +
                "Ctrl+Enter — Validate and run workflow\n" +
                "Ctrl+` — Toggle execution console\n" +
                "Delete — Delete selected widget/connection\n" +
                "Escape — Deselect / close peek state\n" +
                "Middle mouse drag — Pan canvas",
            tone: "info",
            confirmLabel: "Got it"
        });
    }

    updateRunControls() {
        if (this.runWorkflowMenuItem) {
            this.runWorkflowMenuItem.disabled =
                this.isWorkflowRunning;
        }

        if (this.stopWorkflowMenuItem) {
            this.stopWorkflowMenuItem.disabled =
                !this.isWorkflowRunning;
        }
    }

    getTopologicalOrder() {
        const indegree = new Map();
        const outgoing = new Map();

        this.widgets.forEach((widget) => {
            indegree.set(widget, 0);
            outgoing.set(widget, []);
        });

        this.connections.forEach(
            (connection) => {
                if (
                    !indegree.has(
                        connection.sourceWidget
                    ) ||
                    !indegree.has(
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
            this.widgets.filter(
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
                this.widgets.length
        };
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
                            widget.type !== "End"
                        ) {
                            warnings.push(
                                `"${widget.title}" output "${output.name}" is not connected.`
                            );
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

                if (
                    widget.language === "Expression" &&
                    widget.type !== "Start" &&
                    widget.type !== "End" &&
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
        const duration =
            Math.max(
                0,
                Math.min(
                    5000,
                    milliseconds
                )
            );

        if (duration === 0) {
            return;
        }

        await new Promise(
            (resolve) => {
                setTimeout(
                    resolve,
                    duration
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

                context[name] =
                    this.coerceWorkflowValue(
                        input.value
                    );

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

        if (
            Array.isArray(result)
        ) {
            widget.outputs.forEach(
                (output, index) => {
                    if (
                        index <
                        result.length
                    ) {
                        output.value =
                            result[index];
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
                        output.value =
                            result[output.name];
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
                    output.value = result;
                }
            );

            return;
        }

        widget.outputs[0].value = result;
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

    async runWorkflow() {
        if (this.isWorkflowRunning) {
            return;
        }

        const report =
            this.validateWorkflow(false);

        if (!report.valid) {
            this.setExecutionConsoleStatus(
                "error"
            );
            this.logValidationReport(
                report,
                { open: true }
            );

            await this.showMessageDialog({
                title: "Workflow Cannot Run",
                message:
                    this.formatValidationReport(
                        report
                    ),
                tone: "warning",
                confirmLabel: "Review Workflow"
            });
            return;
        }

        const topology =
            this.getTopologicalOrder();

        this.executionRunId += 1;
        const runId =
            this.executionRunId;

        this.isWorkflowRunning = true;
        this.setExecutionConsoleStatus(
            "running"
        );
        this.setExecutionConsoleOpen(true);
        this.updateRunControls();

        this.appendExecutionLog(
            "info",
            `Workflow run #${runId} started.`,
            `${this.widgets.length} widget(s) · ${this.connections.length} connection(s)`
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

        this.widgets.forEach(
            (widget) => {
                widget.runtimeMs = 0;
                widget.memoryKb = 0;
                widget.lastError = "";
                widget.setStatus(
                    widget.type === "Start"
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
                const widget of
                topology.order
            ) {
                if (
                    runId !==
                    this.executionRunId
                ) {
                    return;
                }

                widget.inputs.forEach(
                    (input) => {
                        this.refreshInputValueFromConnections(
                            widget,
                            input.id
                        );
                    }
                );

                widget.refreshContent();
                widget.setStatus(
                    "running",
                    0,
                    0
                );
                this.updateStats();

                this.appendExecutionLog(
                    "node",
                    `${widget.title} started.`,
                    this.getWidgetInputLogSummary(
                        widget
                    )
                );

                if (
                    this.selectedWidget ===
                    widget
                ) {
                    this.showWidgetProperties(
                        widget
                    );
                }

                const startedAt =
                    performance.now();

                const delay =
                    Math.max(
                        0,
                        Number(
                            widget.executionDelayMs
                        ) || 0
                    ) +
                    this.getScriptDelay(
                        widget
                    );

                await this.waitForExecution(
                    delay,
                    runId
                );

                if (
                    widget.type !== "Start" ||
                    (
                        widget.source &&
                        widget.language !==
                            "Pass-through"
                    )
                ) {
                    const context =
                        this.buildInputContext(
                            widget
                        );

                    const result =
                        this.interpretWidgetSource(
                            widget,
                            context
                        );

                    this.applyExecutionResult(
                        widget,
                        result
                    );
                }

                widget.outputs.forEach(
                    (output) => {
                        this.propagateOutputValue(
                            widget,
                            output.id
                        );
                    }
                );

                const runtime =
                    performance.now() -
                    startedAt;

                const memory =
                    this.estimateWidgetMemory(
                        widget
                    );

                widget.setStatus(
                    "finished",
                    runtime,
                    memory
                );

                widget.refreshContent();
                this.updateStats();

                this.appendExecutionLog(
                    "success",
                    `${widget.title} finished.`,
                    `${this.getWidgetOutputLogSummary(widget)} · ${runtime.toFixed(1)} ms · ${memory.toFixed(1)} KB`
                );

                if (
                    this.selectedWidget ===
                    widget
                ) {
                    this.showWidgetProperties(
                        widget
                    );
                }
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
                this.widgets.find(
                    (widget) =>
                        widget.status ===
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
            if (
                runId ===
                this.executionRunId
            ) {
                this.isWorkflowRunning = false;
            }

            this.lastRunRuntimeMs =
                this.widgets.reduce(
                    (total, widget) =>
                        total +
                        (
                            Number(
                                widget.runtimeMs
                            ) || 0
                        ),
                    0
                );

            this.lastRunMemoryKb =
                this.widgets.reduce(
                    (total, widget) =>
                        total +
                        (
                            Number(
                                widget.memoryKb
                            ) || 0
                        ),
                    0
                );

            if (
                runId ===
                    this.executionRunId &&
                !runFailed
            ) {
                this.setExecutionConsoleStatus(
                    "finished"
                );
                this.appendExecutionLog(
                    "success",
                    `Workflow run #${runId} completed.`,
                    `${this.lastRunRuntimeMs.toFixed(1)} ms total runtime · ${this.lastRunMemoryKb.toFixed(1)} KB estimated memory`
                );
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
                ".input-port.connection-target"
            )
            .forEach((port) => {
                port.classList.remove(
                    "connection-target"
                );
            });

        if (nearestInputPort) {
            nearestInputPort.classList.add(
                "connection-target"
            );
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
                    ".input-port.connection-target"
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
                ".input-port.connection-target"
            )
            .forEach((port) => {
                port.classList.remove(
                    "connection-target"
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

        this.nextConnectionNumber = 1;

        this.cancelConnectionDrag();
    }

}