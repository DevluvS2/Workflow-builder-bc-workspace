class Board {
    constructor(rootElement) {
        this.rootElement = rootElement;

        this.widgets = [];
        this.selectedWidget = null;

        this.leftPanelVisible = true;
        this.rightPanelVisible = true;

        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;

        this.minimumZoom = 0.25;
        this.maximumZoom = 4;
        this.zoomStep = 0.1;

        this.nextWidgetNumber = 1;

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

        this.workspaceContainer = this.createWorkspace();

        this.rightPanel = this.createPanel(
            "right",
            "Properties"
        );

        mainArea.appendChild(this.leftPanel);
        mainArea.appendChild(this.workspaceContainer);
        mainArea.appendChild(this.rightPanel);

        const leftShowZone = this.createPanelShowZone("left");
        const rightShowZone = this.createPanelShowZone("right");

        mainArea.appendChild(leftShowZone);
        mainArea.appendChild(rightShowZone);

        this.leftShowZone = leftShowZone;
        this.rightShowZone = rightShowZone;

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
                if (
                    event.target === workspaceContainer ||
                    event.target === workspace
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

        const widget = new Widget(
            this,
            id,
            title,
            type,
            120 + offset,
            100 + offset
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

            this.mainArea.classList.toggle(
                "right-hidden",
                !this.rightPanelVisible
            );

            this.rightShowZone.classList.toggle(
                "hidden",
                this.rightPanelVisible
            );
        }
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

        this.updateWorkspaceTransform();
        this.updateStats();
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
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;

        this.updateWorkspaceTransform();
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

                this.updateWorkspaceTransform();
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

        if (this.widgets.length === 0) {
            const emptyMessage =
                document.createElement("div");

            emptyMessage.className =
                "workflow-map-empty";

            emptyMessage.textContent = "No widgets";

            this.workflowMapContent.appendChild(
                emptyMessage
            );

            return;
        }

        /*
         * Map the 3000 × 2000 workspace into the small mini-map.
         */
        const mapWidth =
            this.workflowMapContent.clientWidth || 198;

        const mapHeight =
            this.workflowMapContent.clientHeight || 112;

        const workspaceWidth = 3000;
        const workspaceHeight = 2000;

        this.widgets.forEach((widget) => {
            const mapItem =
                document.createElement("div");

            mapItem.className = "workflow-map-item";
            mapItem.title = widget.title;

            const mapX =
                (widget.x / workspaceWidth) * mapWidth;

            const mapY =
                (widget.y / workspaceHeight) * mapHeight;

            mapItem.style.left =
                `${Math.max(
                    0,
                    Math.min(mapWidth - 16, mapX)
                )}px`;

            mapItem.style.top =
                `${Math.max(
                    0,
                    Math.min(mapHeight - 10, mapY)
                )}px`;

            this.workflowMapContent.appendChild(mapItem);
        });
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
}