class Board {
    constructor(rootElement) {
        this.rootElement = rootElement;

        this.widgets = [];
        this.selectedWidget = null;

        this.nextWidgetZIndex = 3;

        this.hoverPeekWidget = null;
        this.pinnedPeekWidget = null;

        this.peekOutlineElements = [];

        this.hoverPeekConnections = [];

        this.connections = [];
        this.nextConnectionNumber = 1;

        this.connectionSourceWidget = null;
        this.connectionPreviewElement = null;

        this.connectionMoveHandler = null;
        this.connectionEndHandler = null;
        this.connectionCancelHandler = null;

        this.contextMenu = null;

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

    bringWidgetToFront(widget) {
        if (
            !widget ||
            !widget.element
        ) {
            return;
        }

        widget.zIndex =
            this.nextWidgetZIndex;

        this.nextWidgetZIndex += 1;

        widget.element.style.zIndex =
            String(widget.zIndex);

        this.updateWidgetPeek();

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
                            .outputPortElement;

                    const targetPort =
                        connection.targetWidget
                            .inputPortElement;


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
        widget
    ) {
        if (!widget) {
            return;
        }


        const incomingConnections =
            this.connections.filter(
                (connection) => {
                    return (
                        connection.targetWidget ===
                        widget
                    );
                }
            );


        this.hoverPeekConnections =
            incomingConnections;

        this.updateConnectionPeek();
    }

    stopInputConnectionPeek(
        widget
    ) {
        this.hoverPeekConnections = [];

        this.updateConnectionPeek();
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

        if (event.key === "Escape") {
            this.clearPinnedWidgetPeek();

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
        this.scheduleSave();
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

        this.nextConnectionNumber = 1;

        this.nextWidgetZIndex = 3;

        this.connectionSourceWidget = null;
        this.connectionPreviewElement = null;

        this.connectionMoveHandler = null;
        this.connectionEndHandler = null;
        this.connectionCancelHandler = null;

        this.showNoSelectionMessage();
        this.updateStats();
        this.updateWorkflowMap();
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

                if (
                    typeof widgetData.zIndex ===
                    "number"
                ) {
                    widget.zIndex =
                        widgetData.zIndex;
                }

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
                            targetWidget
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
            "widget-context-menu";

        menu.style.left =
            `${clientX}px`;

        menu.style.top =
            `${clientY}px`;

        const propertiesButton =
            document.createElement("button");

        propertiesButton.textContent =
            "Properties";

        const deleteButton =
            document.createElement("button");

        deleteButton.textContent =
            "Delete";

        propertiesButton.addEventListener(
            "click",
            () => {
                this.openWidgetProperties(
                    widget
                );

                this.hideContextMenu();
            }
        );

        deleteButton.addEventListener(
            "click",
            () => {
                const confirmed =
                    window.confirm(
                        `Delete "${widget.title}"?`
                    );

                if (confirmed) {
                    this.removeWidget(
                        widget
                    );
                }

                this.hideContextMenu();
            }
        );

        menu.appendChild(
            propertiesButton
        );

        menu.appendChild(
            deleteButton
        );

        document.body.appendChild(
            menu
        );

        this.contextMenu = menu;
    }

    openWidgetProperties(widget) {
        this.selectWidget(widget);

        if (!this.rightPanelVisible) {
            this.togglePanel("right");
        }
    }

    startConnection(
        sourceWidget,
        event
    ) {
        if (event.button !== 0) {
            return;
        }

        this.cancelConnectionDrag();

        this.connectionSourceWidget =
            sourceWidget;

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
            !this.connectionPreviewElement
        ) {
            return;
        }

        const sourcePoint =
            this.connectionSourceWidget
                .getOutputPortPosition();

        /*
        * See whether we're close enough
        * to magnetically snap to an input.
        */
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


        /*
        * Remove the old highlight.
        */
        document
            .querySelectorAll(
                ".input-port.connection-target"
            )
            .forEach((port) => {
                port.classList.remove(
                    "connection-target"
                );
            });


        /*
        * Highlight the port we're
        * magnetically snapping toward.
        */
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

    findNearestInputPort(
        clientX,
        clientY,
        sourceWidget,
        maxDistance = 30
    ) {
        const inputPorts =
            document.querySelectorAll(
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

                /*
                * Don't connect a widget
                * to itself.
                */
                if (
                    !targetWidget ||
                    targetWidget ===
                        sourceWidget
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

        if (!sourceWidget) {
            this.cancelConnectionDrag();
            return;
        }

        try {
            /*
            * updateConnectionPreview() already found
            * the nearest valid input and gave it the
            * connection-target class.
            *
            * Use that exact port instead of trying
            * to calculate the target again.
            */
            const inputPort =
                document.querySelector(
                    ".input-port.connection-target"
                );

            if (!inputPort) {
                return;
            }

            const targetWidget =
                this.getWidgetFromPort(
                    inputPort
                );

            if (
                !targetWidget ||
                targetWidget === sourceWidget
            ) {
                return;
            }

            const alreadyConnected =
                this.connections.some(
                    (connection) => {
                        return (
                            connection.sourceWidget ===
                                sourceWidget &&
                            connection.targetWidget ===
                                targetWidget
                        );
                    }
                );

            if (alreadyConnected) {
                return;
            }

            this.addConnection(
                sourceWidget,
                targetWidget
            );
        } finally {
            this.cancelConnectionDrag();
        }
    }

    addConnection(
        sourceWidget,
        targetWidget
    ) {
        const id =
            `connection-${this.nextConnectionNumber}`;

        this.nextConnectionNumber += 1;

        const connection =
            new Connection(
                this,
                id,
                sourceWidget,
                targetWidget
            );

        const connectionElement =
            connection.render();

        this.connectionLayer.appendChild(
            connectionElement
        );

        this.connections.push(
            connection
        );

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

    removeConnection(connection) {
        const connectionIndex =
            this.connections.indexOf(
                connection
            );

        if (connectionIndex === -1) {
            return;
        }

        this.hoverPeekConnections =
            this.hoverPeekConnections.filter(
                (currentConnection) =>
                    currentConnection !==
                    connection
            );
        this.updateConnectionPeek();

        connection.remove();

        this.connections.splice(
            connectionIndex,
            1
        );

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
                    connection
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