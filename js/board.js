class Board {
    constructor(rootElement) {
        this.rootElement = rootElement;

        this.widgets = [];
        this.selectedWidget = null;

        this.leftPanelVisible = true;
        this.rightPanelVisible = true;

        this.leftPanelWidth = 220;
        this.rightPanelWidth = 260;
        
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

        this.minimumZoom = 0.25;
        this.maximumZoom = 4;
        this.zoomStep = 0.1;

        this.nextWidgetNumber = 1;

        this.storageKey =
            "workflowBuilderCurrentWorkflow";

        this.saveTimer = null;

        document.addEventListener("keydown", (event) => {
            this.handleKeyDown(event);
        });

        this.render();
    }

    render() {
        this.rootElement.innerHTML = "";

        const boardElement = document.createElement("div");
        boardElement.className = "board";

        const menuBar = this.createMenuBar();
        const mainArea = this.createMainArea();
        const statsBar = this.createStatsBar();

        boardElement.appendChild(menuBar);
        boardElement.appendChild(mainArea);
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

        const fileMenu = document.createElement("div");
        fileMenu.className = "dropdown-menu";

        const fileButton = document.createElement("button");
        fileButton.className = "dropdown-button";
        fileButton.textContent = "File";

        const fileDropdown = document.createElement("div");
        fileDropdown.className = "dropdown-content";

        const newMenuItem = document.createElement("button");
        newMenuItem.textContent = "New";

        const exportMenuItem = document.createElement("button");
        exportMenuItem.textContent = "Export";

        exportMenuItem.addEventListener(
            "click",
            () => {
                this.exportWorkflow();
            }
        );

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

        importMenuItem.addEventListener(
            "click",
            () => {
                importInput.click();
            }
        );

        importInput.addEventListener(
            "change",
            (event) => {
                const selectedFile =
                    event.target.files[0];

                if (selectedFile) {
                    this.importWorkflow(
                        selectedFile
                    );
                }

                event.target.value = "";
            }
        );

        const editButton = document.createElement("button");
        editButton.textContent = "Edit";

        const viewButton = document.createElement("button");
        viewButton.textContent = "View";

        const helpButton = document.createElement("button");
        helpButton.textContent = "Help";

        const leftPanelButton = document.createElement("button");
        leftPanelButton.textContent = "Toggle Left Panel";

        const rightPanelButton = document.createElement("button");
        rightPanelButton.textContent = "Toggle Right Panel";

        leftPanelButton.addEventListener("click", () => {
            this.togglePanel("left");
        });

        rightPanelButton.addEventListener("click", () => {
            this.togglePanel("right");
        });

        const resetViewButton = document.createElement("button");
        resetViewButton.textContent = "Reset View";

        resetViewButton.addEventListener("click", () => {
            this.resetView();
        });

        const spacer = document.createElement("div");
        spacer.className = "menu-spacer";

        const zoomDisplay = document.createElement("span");
        zoomDisplay.className = "zoom-display";
        zoomDisplay.textContent = "Zoom: 100%";

        this.zoomDisplay = zoomDisplay;

        menuBar.appendChild(fileMenu);
        menuBar.appendChild(editButton);
        menuBar.appendChild(viewButton);
        menuBar.appendChild(helpButton);
        menuBar.appendChild(leftPanelButton);
        menuBar.appendChild(rightPanelButton);
        menuBar.appendChild(resetViewButton);
        menuBar.appendChild(spacer);
        menuBar.appendChild(zoomDisplay);

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
        const workflowMap = document.createElement("div");
        workflowMap.className = "workflow-map";

        const mapTitle = document.createElement("div");
        mapTitle.className = "workflow-map-title";
        mapTitle.textContent = "Workflow Map";

        const mapContent = document.createElement("div");
        mapContent.className = "workflow-map-content";

        workflowMap.appendChild(mapTitle);
        workflowMap.appendChild(mapContent);

        this.workflowMapContent = mapContent;

        mapContent.addEventListener(
            "pointerdown",
            (event) => {
                this.centerViewFromMap(event);
            }
        );

        return workflowMap;
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

        if (widget.element) {
            widget.element.remove();
        }

        this.widgets.splice(widgetIndex, 1);

        if (this.selectedWidget === widget) {
            this.selectedWidget = null;
            this.showNoSelectionMessage();
        }

        this.updateStats();
        this.updateWorkflowMap();
        this.scheduleSave();
    }

    handleKeyDown(event) {
        /*
        * Do not delete widgets while the user is typing
        * inside an input field.
        */
        const activeElement = document.activeElement;

        const isTyping =
            activeElement &&
            (
                activeElement.tagName === "INPUT" ||
                activeElement.tagName === "TEXTAREA" ||
                activeElement.isContentEditable
            );

        if (isTyping) {
            return;
        }

        if (
            event.key === "Delete" &&
            this.selectedWidget
        ) {
            event.preventDefault();

            const confirmed = window.confirm(
                `Delete "${this.selectedWidget.title}"?`
            );

            if (confirmed) {
                this.removeWidget(this.selectedWidget);
            }
        }
    }

    selectWidget(widget) {
        this.widgets.forEach((currentWidget) => {
            currentWidget.setSelected(currentWidget === widget);
        });

        this.selectedWidget = widget;

        if (widget) {
            this.showWidgetProperties(widget);
        } else {
            this.showNoSelectionMessage();
        }

        this.updateStats();
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

    showWidgetProperties(widget) {
        this.propertiesPanelContent.innerHTML = "";

        const titleRow = document.createElement("div");
        titleRow.className = "property-row";

        const titleLabel = document.createElement("label");
        titleLabel.textContent = "Title";

        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.value = widget.title;

        titleInput.addEventListener("input", () => {
            widget.setTitle(titleInput.value);
        });

        titleRow.appendChild(titleLabel);
        titleRow.appendChild(titleInput);

        const typeRow = document.createElement("div");
        typeRow.className = "property-row";

        const typeLabel = document.createElement("label");
        typeLabel.textContent = "Type";

        const typeInput = document.createElement("input");
        typeInput.type = "text";
        typeInput.value = widget.type;

        typeInput.addEventListener("input", () => {
            widget.setType(typeInput.value);
        });

        typeRow.appendChild(typeLabel);
        typeRow.appendChild(typeInput);

        const positionRow = document.createElement("div");
        positionRow.className = "property-row";

        const positionLabel = document.createElement("label");
        positionLabel.textContent = "Position";

        const positionText = document.createElement("div");
        positionText.textContent =
            `X: ${Math.round(widget.x)}, ` +
            `Y: ${Math.round(widget.y)}`;

        positionRow.appendChild(positionLabel);
        positionRow.appendChild(positionText);

        const actions = document.createElement("div");
        actions.className = "property-actions";

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-button";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", () => {
            this.removeWidget(widget);
        });

        actions.appendChild(deleteButton);

        this.propertiesPanelContent.appendChild(titleRow);
        this.propertiesPanelContent.appendChild(typeRow);
        this.propertiesPanelContent.appendChild(positionRow);
        this.propertiesPanelContent.appendChild(actions);
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
    }

    createNewWorkflow() {
        const confirmed = window.confirm(
            "Create a new workflow? " +
            "The current workflow will be cleared."
        );

        if (!confirmed) {
            return;
        }

        this.clearWorkflow();

        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.nextWidgetNumber = 1;

        this.updateWorkspaceTransform();
    }

    clearWorkflow() {
        this.widgets.forEach((widget) => {
            if (widget.element) {
                widget.element.remove();
            }
        });

        this.widgets = [];
        this.selectedWidget = null;

        this.showNoSelectionMessage();
        this.updateStats();
        this.updateWorkflowMap();
    }

    exportWorkflow() {
        const workflowData = {
            version: 1,
            zoom: this.zoom,
            panX: this.panX,
            panY: this.panY,
            widgets: this.widgets.map((widget) => {
                return widget.toJSON();
            })
        };

        const jsonText = JSON.stringify(
            workflowData,
            null,
            2
        );

        const fileBlob = new Blob(
            [jsonText],
            {
                type: "application/json"
            }
        );

        const downloadUrl =
            URL.createObjectURL(fileBlob);

        const downloadLink =
            document.createElement("a");

        downloadLink.href = downloadUrl;
        downloadLink.download = "workflow.json";

        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();

        URL.revokeObjectURL(downloadUrl);
    }

    importWorkflow(file) {
        const reader = new FileReader();

        reader.addEventListener("load", () => {
            try {
                const workflowData =
                    JSON.parse(reader.result);

                if (
                    !workflowData ||
                    !Array.isArray(workflowData.widgets)
                ) {
                    throw new Error(
                        "Workflow does not contain a widget array."
                    );
                }

                this.clearWorkflow();

                workflowData.widgets.forEach(
                    (widgetData) => {
                        const widget = new Widget(
                            this,
                            String(widgetData.id),
                            String(widgetData.title),
                            String(
                                widgetData.type || "Process"
                            ),
                            Number(widgetData.x),
                            Number(widgetData.y)
                        );

                        if (
                            Number.isNaN(widget.x) ||
                            Number.isNaN(widget.y)
                        ) {
                            throw new Error(
                                "A widget has invalid coordinates."
                            );
                        }

                        this.addWidget(widget);
                    }
                );

                if (
                    typeof workflowData.zoom === "number"
                ) {
                    this.zoom = Math.max(
                        this.minimumZoom,
                        Math.min(
                            this.maximumZoom,
                            workflowData.zoom
                        )
                    );
                }

                if (
                    typeof workflowData.panX === "number"
                ) {
                    this.panX = workflowData.panX;
                }

                if (
                    typeof workflowData.panY === "number"
                ) {
                    this.panY = workflowData.panY;
                }

                this.nextWidgetNumber =
                    this.widgets.length + 1;

                this.centerWorkspace();
                this.updateStats();
                this.updateWorkflowMap();
            } catch (error) {
                window.alert(
                    "The selected workflow file is invalid."
                );

                console.error(error);
            }
        });

        reader.addEventListener("error", () => {
            window.alert(
                "The workflow file could not be read."
            );
        });

        reader.readAsText(file);
    }

    updateStats() {
        if (!this.widgetCountElement) {
            return;
        }

        const widgetCount = this.widgets.length;

        /*
         * These are mock values for the assignment.
         */
        const mockRuntime = widgetCount * 12;
        const mockSpace = widgetCount * 4;

        this.widgetCountElement.textContent =
            `Widgets: ${widgetCount}`;

        this.runtimeElement.textContent =
            `Runtime: ${mockRuntime} ms`;

        this.spaceElement.textContent =
            `Space used: ${mockSpace} KB`;

        if (this.selectedWidget) {
            this.positionElement.textContent =
                `Selected: ${this.selectedWidget.title}`;
        } else {
            this.positionElement.textContent =
                `Zoom: ${Math.round(this.zoom * 100)}%`;
        }
    }

    updateWorkflowMap() {
        if (!this.workflowMapContent) {
            return;
        }

        this.workflowMapContent.innerHTML = "";

        const mapWidth =
            this.workflowMapContent.clientWidth || 198;

        const mapHeight =
            this.workflowMapContent.clientHeight || 112;

        /*
        * Draw each widget as a small rectangle.
        */
        if (this.widgets.length === 0) {
            const emptyMessage =
                document.createElement("div");

            emptyMessage.className =
                "workflow-map-empty";

            emptyMessage.textContent = "No widgets";

            this.workflowMapContent.appendChild(
                emptyMessage
            );
        } else {
            this.widgets.forEach((widget) => {
                const mapItem =
                    document.createElement("div");

                mapItem.className =
                    "workflow-map-item";

                mapItem.title = widget.title;

                const mapX =
                    (widget.x / this.workspaceWidth) *
                    mapWidth;

                const mapY =
                    (widget.y / this.workspaceHeight) *
                    mapHeight;

                mapItem.style.left =
                    `${Math.max(
                        0,
                        Math.min(
                            mapWidth - 16,
                            mapX
                        )
                    )}px`;

                mapItem.style.top =
                    `${Math.max(
                        0,
                        Math.min(
                            mapHeight - 10,
                            mapY
                        )
                    )}px`;

                this.workflowMapContent.appendChild(
                    mapItem
                );
            });
        }

        /*
        * Determine what part of the workspace
        * is currently visible.
        */
        const worldLeft =
            -this.panX / this.zoom;

        const worldTop =
            -this.panY / this.zoom;

        const visibleWorldWidth =
            this.workspaceContainer.clientWidth /
            this.zoom;

        const visibleWorldHeight =
            this.workspaceContainer.clientHeight /
            this.zoom;

        /*
        * Convert that visible area into mini-map coordinates.
        */
        let viewportLeft =
            (worldLeft / this.workspaceWidth) *
            mapWidth;

        let viewportTop =
            (worldTop / this.workspaceHeight) *
            mapHeight;

        let viewportWidth =
            (visibleWorldWidth / this.workspaceWidth) *
            mapWidth;

        let viewportHeight =
            (visibleWorldHeight / this.workspaceHeight) *
            mapHeight;

        /*
        * Prevent the viewport rectangle from becoming
        * invisible or extending outside the map.
        */
        viewportWidth = Math.min(
            mapWidth,
            Math.max(8, viewportWidth)
        );

        viewportHeight = Math.min(
            mapHeight,
            Math.max(8, viewportHeight)
        );

        viewportLeft = Math.max(
            0,
            Math.min(
                mapWidth - viewportWidth,
                viewportLeft
            )
        );

        viewportTop = Math.max(
            0,
            Math.min(
                mapHeight - viewportHeight,
                viewportTop
            )
        );

        const viewport =
            document.createElement("div");

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

        this.workflowMapContent.appendChild(
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

    centerViewFromMap(event) {
        const mapRect =
            this.workflowMapContent
                .getBoundingClientRect();

        const mapX =
            event.clientX - mapRect.left;

        const mapY =
            event.clientY - mapRect.top;
        /*
        * Convert mini-map coordinates back into
        * workspace coordinates.
        */
        const worldX =
            (mapX / mapRect.width) *
            this.workspaceWidth;

        const worldY =
            (mapY / mapRect.height) *
            this.workspaceHeight;

        /*
        * Put that location in the center
        * of the visible canvas.
        */
        this.panX =
            this.workspaceContainer.clientWidth / 2 -
            worldX * this.zoom;

        this.panY =
            this.workspaceContainer.clientHeight / 2 -
            worldY * this.zoom;

        this.updateWorkspaceTransform();
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

    getWorkflowData() {
        return {
            version: 1,

            zoom: this.zoom,
            panX: this.panX,
            panY: this.panY,

            leftPanelWidth:
                this.leftPanelWidth,

            rightPanelWidth:
                this.rightPanelWidth,

            widgets: this.widgets.map(
                (widget) => {
                    return widget.toJSON();
                }
            )
        };
    }

    exportWorkflow() {
        const workflowData =
            this.getWorkflowData();

        const jsonText = JSON.stringify(
            workflowData,
            null,
            2
        );

        const fileBlob = new Blob(
            [jsonText],
            {
                type: "application/json"
            }
        );

        const downloadUrl =
            URL.createObjectURL(fileBlob);

        const downloadLink =
            document.createElement("a");

        downloadLink.href = downloadUrl;

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

    importWorkflow(file) {
        const reader = new FileReader();

        reader.addEventListener(
            "load",
            () => {
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
                            window.confirm(
                                "Importing this workflow will replace your current workflow. Continue?"
                            );

                        if (!confirmed) {
                            return;
                        }
                    }

                    this.applyWorkflowData(
                        workflowData
                    );
                } catch (error) {
                    console.error(error);

                    window.alert(
                        "This is not a valid workflow JSON file."
                    );
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

                this.addWidget(widget);
            }
        );

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
            version: 1,

            workspaceWidth:
                this.workspaceWidth,

            workspaceHeight:
                this.workspaceHeight,

            leftPanelWidth:
                this.leftPanelWidth,

            rightPanelWidth:
                this.rightPanelWidth,

            widgets: this.widgets.map(
                (widget) => {
                    return widget.toJSON();
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

}