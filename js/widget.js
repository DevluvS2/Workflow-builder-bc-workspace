class Widget {
    constructor(board, id, title, type, x, y) {
        this.board = board;

        this.id = id;
        this.title = title;
        this.type = type;

        this.x = x;
        this.y = y;
        this.zIndex = null;

        this.element = null;
        this.headerElement = null;
        this.titleElement = null;
        this.contentElement = null;
        this.statusElement = null;
        this.statusIndicatorElement = null;
        this.noteIndicatorElement = null;
        this.errorIndicatorElement = null;
        this.collapseButtonElement = null;

        this.inputPortElements = new Map();
        this.outputPortElements = new Map();

        /*
         * Backward-compatible references to the first
         * input/output port. Older Board code can still
         * use these safely while the app supports many ports.
         */
        this.inputPortElement = null;
        this.outputPortElement = null;

        this.inputs = [];
        this.outputs = [];
        this.nextPortNumber = 1;

        this.status =
            type === "Start"
                ? "idle"
                : "waiting";

        /*
         * Widget chrome stays intentionally compact. Status is shown
         * as an accessible header indicator instead of a full-width
         * footer, and widgets can be collapsed without losing ports.
         */
        this.showStatus = true;
        this.collapsed = false;
        this.notes = "";

        this.runtimeMs = 0;
        this.memoryKb = 0;
        this.lastError = "";

        /*
         * Decision-node branching configuration.
         *
         * Decision widgets evaluate a safe expression and then activate
         * exactly one configured output branch. The selected branch can
         * forward the first input value, the Boolean condition result, or
         * an object containing every named input.
         */
        this.decisionExpression = "value";
        this.decisionTrueOutputId = null;
        this.decisionFalseOutputId = null;
        this.decisionPayloadMode = "first-input";
        this.lastDecisionResult = null;

        /*
         * Script configuration. The Board owns execution.
         * Bash/Python/JavaScript are intentionally interpreted
         * by the local workflow simulator rather than executed
         * as unrestricted system processes.
         */
        this.language =
            type === "Start" ||
            type === "End" ||
            type === "Decision"
                ? "Pass-through"
                : "Expression";

        this.source = "";
        this.executionDelayMs = 180;

        this.isDragging = false;
        this.dragPointerStartX = 0;
        this.dragPointerStartY = 0;
        this.broughtToFrontThisDrag = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.dragHistorySnapshot = null;

        this.createDefaultPorts();
    }

    createDefaultPorts() {
        if (this.type === "Start") {
            this.outputs = [
                this.createPortRecord(
                    "output",
                    "value"
                )
            ];

            return;
        }

        if (this.type === "End") {
            this.inputs = [
                this.createPortRecord(
                    "input",
                    "value"
                )
            ];

            return;
        }

        if (this.type === "Decision") {
            this.inputs = [
                this.createPortRecord(
                    "input",
                    "value"
                )
            ];

            const trueOutput =
                this.createPortRecord(
                    "output",
                    "true"
                );

            const falseOutput =
                this.createPortRecord(
                    "output",
                    "false"
                );

            this.outputs = [
                trueOutput,
                falseOutput
            ];

            this.decisionTrueOutputId =
                trueOutput.id;

            this.decisionFalseOutputId =
                falseOutput.id;

            return;
        }

        this.inputs = [
            this.createPortRecord(
                "input",
                "value"
            )
        ];

        this.outputs = [
            this.createPortRecord(
                "output",
                "result"
            )
        ];
    }

    createPortRecord(direction, name) {
        const prefix =
            direction === "input"
                ? "in"
                : "out";

        const id =
            `${prefix}-${this.nextPortNumber}`;

        this.nextPortNumber += 1;

        if (direction === "input") {
            return {
                id,
                name,
                dataType: "Any",
                value: "",
                manualValue: "",
                required: true
            };
        }

        return {
            id,
            name,
            dataType: "Any",
            value: ""
        };
    }

    ensurePortCounter() {
        let highest = 0;

        [
            ...this.inputs,
            ...this.outputs
        ].forEach((port) => {
            const match =
                String(port.id || "")
                    .match(/-(\d+)$/);

            if (match) {
                highest = Math.max(
                    highest,
                    Number(match[1])
                );
            }
        });

        this.nextPortNumber =
            Math.max(
                this.nextPortNumber,
                highest + 1
            );
    }

    normalizeInput(port, index) {
        return {
            id:
                String(
                    port && port.id
                        ? port.id
                        : `in-${index + 1}`
                ),

            name:
                String(
                    port && port.name
                        ? port.name
                        : `input ${index + 1}`
                ),

            dataType:
                Widget.normalizeDataType(
                    port && port.dataType
                        ? port.dataType
                        : "Any"
                ),

            value:
                port && port.value !== undefined
                    ? port.value
                    : "",

            manualValue:
                port && port.manualValue !== undefined
                    ? port.manualValue
                    : (
                        port && port.value !== undefined
                            ? port.value
                            : ""
                    ),

            required:
                port &&
                typeof port.required === "boolean"
                    ? port.required
                    : true
        };
    }

    normalizeOutput(port, index) {
        return {
            id:
                String(
                    port && port.id
                        ? port.id
                        : `out-${index + 1}`
                ),

            name:
                String(
                    port && port.name
                        ? port.name
                        : `output ${index + 1}`
                ),

            dataType:
                Widget.normalizeDataType(
                    port && port.dataType
                        ? port.dataType
                        : "Any"
                ),

            value:
                port && port.value !== undefined
                    ? port.value
                    : ""
        };
    }

    applyJSON(data = {}) {
        if (
            Array.isArray(data.inputs)
        ) {
            this.inputs =
                data.inputs.map(
                    (port, index) =>
                        this.normalizeInput(
                            port,
                            index
                        )
                );
        }

        if (
            Array.isArray(data.outputs)
        ) {
            this.outputs =
                data.outputs.map(
                    (port, index) =>
                        this.normalizeOutput(
                            port,
                            index
                        )
                );
        }

        if (
            typeof data.showStatus ===
            "boolean"
        ) {
            this.showStatus =
                data.showStatus;
        }

        if (
            typeof data.collapsed ===
            "boolean"
        ) {
            this.collapsed =
                data.collapsed;
        }

        if (data.notes !== undefined) {
            this.notes =
                String(data.notes || "");
        }

        if (data.status) {
            this.status =
                String(data.status);
        }

        if (
            Number.isFinite(
                Number(data.runtimeMs)
            )
        ) {
            this.runtimeMs =
                Number(data.runtimeMs);
        }

        if (
            Number.isFinite(
                Number(data.memoryKb)
            )
        ) {
            this.memoryKb =
                Number(data.memoryKb);
        }

        if (data.language) {
            this.language =
                String(data.language);
        }

        if (
            data.source !== undefined
        ) {
            this.source =
                String(data.source);
        }

        if (
            Number.isFinite(
                Number(
                    data.executionDelayMs
                )
            )
        ) {
            this.executionDelayMs =
                Math.max(
                    0,
                    Number(
                        data.executionDelayMs
                    )
                );
        }

        if (data.lastError) {
            this.lastError =
                String(data.lastError);
        }

        if (
            data.decisionExpression !==
            undefined
        ) {
            this.decisionExpression =
                String(
                    data.decisionExpression
                );
        }

        if (
            data.decisionTrueOutputId !==
            undefined
        ) {
            this.decisionTrueOutputId =
                data.decisionTrueOutputId
                    ? String(
                        data.decisionTrueOutputId
                    )
                    : null;
        }

        if (
            data.decisionFalseOutputId !==
            undefined
        ) {
            this.decisionFalseOutputId =
                data.decisionFalseOutputId
                    ? String(
                        data.decisionFalseOutputId
                    )
                    : null;
        }

        if (
            [
                "first-input",
                "condition-result",
                "input-object"
            ].includes(
                data.decisionPayloadMode
            )
        ) {
            this.decisionPayloadMode =
                data.decisionPayloadMode;
        }

        if (
            typeof data.lastDecisionResult ===
            "boolean"
        ) {
            this.lastDecisionResult =
                data.lastDecisionResult;
        } else {
            this.lastDecisionResult = null;
        }

        this.ensurePortCounter();

        if (this.type === "Decision") {
            this.ensureDecisionConfiguration(
                true
            );
        }

        if (this.element) {
            this.refreshContent();
        }
    }

    render() {
        const element =
            document.createElement("div");

        element.className = "widget";
        element.dataset.widgetId = this.id;

        const headerElement =
            document.createElement("div");

        headerElement.className =
            "widget-title";

        const titleElement =
            document.createElement("span");

        titleElement.className =
            "widget-title-text";

        const headerActions =
            document.createElement("div");

        headerActions.className =
            "widget-header-actions";

        const noteIndicator =
            document.createElement("span");

        noteIndicator.className =
            "widget-header-indicator widget-note-indicator";
        noteIndicator.textContent = "✎";
        noteIndicator.title = "This widget has research notes";
        noteIndicator.setAttribute(
            "aria-label",
            "Research notes are attached"
        );

        const errorIndicator =
            document.createElement("span");

        errorIndicator.className =
            "widget-header-indicator widget-error-indicator";
        errorIndicator.textContent = "!";
        errorIndicator.setAttribute(
            "aria-label",
            "Widget error"
        );

        const statusIndicator =
            document.createElement("span");

        statusIndicator.className =
            "widget-status-indicator";
        statusIndicator.tabIndex = 0;
        statusIndicator.setAttribute(
            "role",
            "img"
        );

        const collapseButton =
            document.createElement("button");

        collapseButton.type = "button";
        collapseButton.className =
            "widget-collapse-button";

        [
            collapseButton
        ].forEach((control) => {
            control.addEventListener(
                "pointerdown",
                (event) => {
                    event.stopPropagation();
                }
            );
        });

        collapseButton.addEventListener(
            "click",
            (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.toggleCollapsed();
            }
        );

        headerActions.appendChild(
            noteIndicator
        );
        headerActions.appendChild(
            errorIndicator
        );
        headerActions.appendChild(
            statusIndicator
        );
        headerActions.appendChild(
            collapseButton
        );

        headerElement.appendChild(
            titleElement
        );
        headerElement.appendChild(
            headerActions
        );

        const contentElement =
            document.createElement("div");

        contentElement.className =
            "widget-content widget-io-content";

        /*
         * Kept for screen readers and live status announcements.
         * Visual status is represented by the compact header indicator.
         */
        const statusElement =
            document.createElement("div");

        statusElement.className =
            "widget-status widget-status-sr";
        statusElement.setAttribute(
            "aria-live",
            "polite"
        );

        element.appendChild(
            headerElement
        );

        element.appendChild(
            contentElement
        );

        element.appendChild(
            statusElement
        );

        this.element = element;
        this.headerElement = headerElement;
        this.titleElement = titleElement;
        this.contentElement = contentElement;
        this.statusElement = statusElement;
        this.statusIndicatorElement = statusIndicator;
        this.noteIndicatorElement = noteIndicator;
        this.errorIndicatorElement = errorIndicator;
        this.collapseButtonElement = collapseButton;

        this.refreshContent();
        this.updatePosition();
        this.addEventListeners();

        return element;
    }

    refreshContent() {
        if (!this.element) {
            return;
        }

        if (this.titleElement) {
            this.titleElement.textContent =
                this.title;
        }

        this.element.dataset.widgetType =
            this.type;

        this.element.classList.toggle(
            "collapsed",
            this.collapsed
        );

        if (this.collapseButtonElement) {
            this.collapseButtonElement.textContent =
                this.collapsed ? "▾" : "▴";
            this.collapseButtonElement.title =
                this.collapsed
                    ? "Expand widget"
                    : "Collapse widget";
            this.collapseButtonElement.setAttribute(
                "aria-label",
                this.collapsed
                    ? `Expand ${this.title}`
                    : `Collapse ${this.title}`
            );
            this.collapseButtonElement.setAttribute(
                "aria-expanded",
                String(!this.collapsed)
            );
        }

        if (this.noteIndicatorElement) {
            this.noteIndicatorElement.hidden =
                this.notes.trim() === "";
        }

        if (
            this.type === "Decision" &&
            typeof this.lastDecisionResult ===
                "boolean"
        ) {
            this.element.dataset.decisionResult =
                this.lastDecisionResult
                    ? "true"
                    : "false";
        } else {
            delete this.element.dataset
                .decisionResult;
        }

        this.renderIoRows();
        this.updateStatusDisplay();

        if (
            this.board &&
            this.board.workspace &&
            this.element.isConnected
        ) {
            this.board.updateConnectionsForWidget(
                this
            );

            this.board.updateWorkflowMap();
        }
    }

    renderIoRows() {
        if (!this.contentElement) {
            return;
        }

        this.contentElement.innerHTML = "";

        this.inputPortElements.clear();
        this.outputPortElements.clear();
        this.inputPortElement = null;
        this.outputPortElement = null;

        const appendRow =
            (direction, port) => {
                const row =
                    document.createElement(
                        "div"
                    );

                row.className =
                    `widget-io-row widget-${direction}-row`;

                row.dataset.portId =
                    port.id;

                let decisionBranchRole =
                    null;

                if (
                    this.type === "Decision" &&
                    direction === "output"
                ) {
                    if (
                        port.id ===
                        this.decisionTrueOutputId
                    ) {
                        decisionBranchRole =
                            "true";
                    } else if (
                        port.id ===
                        this.decisionFalseOutputId
                    ) {
                        decisionBranchRole =
                            "false";
                    }

                    if (decisionBranchRole) {
                        row.classList.add(
                            `decision-${decisionBranchRole}-output`
                        );

                        row.dataset.branchRole =
                            decisionBranchRole;

                        if (
                            typeof this.lastDecisionResult ===
                                "boolean"
                        ) {
                            const selected =
                                (
                                    decisionBranchRole ===
                                        "true" &&
                                    this.lastDecisionResult
                                ) ||
                                (
                                    decisionBranchRole ===
                                        "false" &&
                                    !this.lastDecisionResult
                                );

                            row.classList.add(
                                selected
                                    ? "decision-branch-selected"
                                    : "decision-branch-not-selected"
                            );
                        }
                    }
                }

                const text =
                    document.createElement(
                        "span"
                    );

                text.className =
                    "widget-io-text";

                if (decisionBranchRole) {
                    const branchBadge =
                        document.createElement(
                            "span"
                        );

                    branchBadge.className =
                        `widget-branch-badge branch-${decisionBranchRole}`;

                    branchBadge.textContent =
                        decisionBranchRole ===
                        "true"
                            ? "TRUE"
                            : "FALSE";

                    row.appendChild(
                        branchBadge
                    );
                }

                const prefix =
                    direction === "input"
                        ? "In"
                        : "Out";

                const normalizedType =
                    Widget.normalizeDataType(
                        port.dataType
                    );

                const hasValue =
                    !(
                        port.value === "" ||
                        port.value === null ||
                        port.value === undefined
                    );

                let rowText =
                    `${prefix} ${port.name}`;

                if (normalizedType !== "Any") {
                    rowText +=
                        ` · ${normalizedType}`;
                }

                if (hasValue) {
                    rowText +=
                        `: ${Widget.formatValue(port.value)}`;
                }

                text.textContent = rowText;

                const portButton =
                    document.createElement(
                        "button"
                    );

                portButton.type = "button";

                portButton.className =
                    `widget-port ${direction}-port`;

                portButton.dataset.portId =
                    port.id;

                portButton.dataset.direction =
                    direction;

                portButton.dataset.dataType =
                    Widget.normalizeDataType(
                        port.dataType
                    );

                portButton.title =
                    `${direction === "input" ? "Input" : "Output"}: ${port.name} · ${Widget.normalizeDataType(port.dataType)}`;

                portButton.setAttribute(
                    "aria-label",
                    `${this.title} ${direction} ${port.name}`
                );

                portButton.addEventListener(
                    "pointerdown",
                    (event) => {
                        event.stopPropagation();
                    }
                );

                portButton.addEventListener(
                    "click",
                    (event) => {
                        event.stopPropagation();
                    }
                );

                if (
                    direction === "output"
                ) {
                    portButton.addEventListener(
                        "pointerdown",
                        (event) => {
                            event.preventDefault();
                            event.stopPropagation();

                            this.board.startConnection(
                                this,
                                event,
                                port.id
                            );
                        }
                    );

                    this.outputPortElements.set(
                        port.id,
                        portButton
                    );

                    if (!this.outputPortElement) {
                        this.outputPortElement =
                            portButton;
                    }
                } else {
                    portButton.addEventListener(
                        "pointerenter",
                        (event) => {
                            event.stopPropagation();

                            this.board.startInputConnectionPeek(
                                this,
                                port.id
                            );
                        }
                    );

                    portButton.addEventListener(
                        "pointerleave",
                        (event) => {
                            event.stopPropagation();

                            this.board.stopInputConnectionPeek(
                                this,
                                port.id
                            );
                        }
                    );

                    this.inputPortElements.set(
                        port.id,
                        portButton
                    );

                    if (!this.inputPortElement) {
                        this.inputPortElement =
                            portButton;
                    }
                }

                if (direction === "input") {
                    row.appendChild(
                        portButton
                    );
                    row.appendChild(text);
                } else {
                    row.appendChild(text);
                    row.appendChild(
                        portButton
                    );
                }

                this.contentElement.appendChild(
                    row
                );
            };

        this.inputs.forEach(
            (port) =>
                appendRow(
                    "input",
                    port
                )
        );

        this.outputs.forEach(
            (port) =>
                appendRow(
                    "output",
                    port
                )
        );

        if (
            this.inputs.length === 0 &&
            this.outputs.length === 0
        ) {
            const empty =
                document.createElement(
                    "div"
                );

            empty.className =
                "widget-empty-io";

            empty.textContent =
                "No inputs or outputs";

            this.contentElement.appendChild(
                empty
            );
        }
    }

    updateStatusDisplay() {
        const allowedStatuses = [
            "idle",
            "waiting",
            "running",
            "finished",
            "error",
            "stopped",
            "skipped"
        ];

        const normalizedStatus =
            allowedStatuses.includes(
                this.status
            )
                ? this.status
                : "idle";

        if (this.element) {
            this.element.dataset.status =
                normalizedStatus;
        }

        const labels = {
            idle: "Idle",
            waiting: "Waiting",
            running: "Running",
            finished: "Finished",
            error: "Failed",
            stopped: "Stopped",
            skipped: "Skipped"
        };

        const symbols = {
            idle: "",
            waiting: "",
            running: "▶",
            finished: "✓",
            error: "×",
            stopped: "■",
            skipped: "–"
        };

        if (this.statusIndicatorElement) {
            allowedStatuses.forEach(
                (status) => {
                    this.statusIndicatorElement
                        .classList.remove(
                            `status-${status}`
                        );
                }
            );

            this.statusIndicatorElement
                .classList.add(
                    `status-${normalizedStatus}`
                );

            this.statusIndicatorElement.textContent =
                symbols[normalizedStatus];
            this.statusIndicatorElement.hidden =
                !this.showStatus;

            let tooltip =
                `Status: ${labels[normalizedStatus]}` +
                ` · ${Math.round(this.runtimeMs)} ms` +
                ` · ${this.memoryKb.toFixed(1)} KB`;

            if (
                this.type === "Decision" &&
                typeof this.lastDecisionResult ===
                    "boolean"
            ) {
                tooltip +=
                    ` · Branch: ${this.lastDecisionResult ? "TRUE" : "FALSE"}`;
            }

            if (
                normalizedStatus === "error" &&
                this.lastError
            ) {
                tooltip +=
                    ` · ${this.lastError}`;
            }

            this.statusIndicatorElement.title =
                tooltip;
            this.statusIndicatorElement.setAttribute(
                "aria-label",
                tooltip
            );
        }

        if (this.errorIndicatorElement) {
            this.errorIndicatorElement.hidden =
                !(
                    normalizedStatus === "error" &&
                    this.lastError
                );

            this.errorIndicatorElement.title =
                this.lastError
                    ? `Error: ${this.lastError}`
                    : "Widget error";
        }

        if (this.statusElement) {
            let text =
                `Status: ${labels[normalizedStatus]}. ` +
                `Runtime ${Math.round(this.runtimeMs)} milliseconds. ` +
                `Memory ${this.memoryKb.toFixed(1)} kilobytes.`;

            if (
                this.type === "Decision" &&
                typeof this.lastDecisionResult ===
                    "boolean"
            ) {
                text +=
                    ` Branch ${this.lastDecisionResult ? "true" : "false"}.`;
            }

            if (
                normalizedStatus === "error" &&
                this.lastError
            ) {
                text +=
                    ` Error: ${this.lastError}`;
            }

            this.statusElement.textContent = text;
            this.statusElement.hidden =
                !this.showStatus;
        }
    }

    setCollapsed(isCollapsed) {
        this.collapsed =
            Boolean(isCollapsed);

        if (this.element) {
            this.element.classList.toggle(
                "collapsed",
                this.collapsed
            );
        }

        if (this.collapseButtonElement) {
            this.collapseButtonElement.textContent =
                this.collapsed ? "▾" : "▴";
            this.collapseButtonElement.title =
                this.collapsed
                    ? "Expand widget"
                    : "Collapse widget";
            this.collapseButtonElement.setAttribute(
                "aria-expanded",
                String(!this.collapsed)
            );
        }

        if (
            this.board &&
            this.element &&
            this.element.isConnected
        ) {
            this.board.updateConnectionsForWidget(
                this
            );
            this.board.updateWorkflowMap();
            this.board.scheduleSave();
        }
    }

    toggleCollapsed() {
        this.setCollapsed(
            !this.collapsed
        );
    }

    addInput(name = null) {
        const port =
            this.createPortRecord(
                "input",
                name ||
                    `input ${this.inputs.length + 1}`
            );

        this.inputs.push(port);
        this.refreshContent();

        return port;
    }

    addOutput(name = null) {
        const port =
            this.createPortRecord(
                "output",
                name ||
                    `output ${this.outputs.length + 1}`
            );

        this.outputs.push(port);
        this.refreshContent();

        return port;
    }

    removeInput(portId) {
        const index =
            this.inputs.findIndex(
                (port) =>
                    port.id === portId
            );

        if (index === -1) {
            return false;
        }

        this.inputs.splice(index, 1);
        this.refreshContent();

        return true;
    }

    removeOutput(portId) {
        const index =
            this.outputs.findIndex(
                (port) =>
                    port.id === portId
            );

        if (index === -1) {
            return false;
        }

        this.outputs.splice(index, 1);
        this.refreshContent();

        return true;
    }

    getInputById(portId) {
        return this.inputs.find(
            (port) =>
                port.id === portId
        ) || null;
    }

    getOutputById(portId) {
        return this.outputs.find(
            (port) =>
                port.id === portId
        ) || null;
    }

    getInputPortElement(portId = null) {
        if (portId) {
            return (
                this.inputPortElements.get(
                    portId
                ) || null
            );
        }

        return this.inputPortElement;
    }

    getOutputPortElement(portId = null) {
        if (portId) {
            return (
                this.outputPortElements.get(
                    portId
                ) || null
            );
        }

        return this.outputPortElement;
    }

    setInputValue(
        portId,
        value,
        updateManual = false
    ) {
        const port =
            this.getInputById(portId);

        if (!port) {
            return;
        }

        port.value = value;

        if (updateManual) {
            port.manualValue = value;
        }

        this.refreshContent();
    }

    setOutputValue(portId, value) {
        const port =
            this.getOutputById(portId);

        if (!port) {
            return;
        }

        port.value = value;
        this.refreshContent();
    }

    setStatus(
        status,
        runtimeMs = this.runtimeMs,
        memoryKb = this.memoryKb,
        errorMessage = ""
    ) {
        this.status = status;
        this.runtimeMs =
            Number.isFinite(runtimeMs)
                ? runtimeMs
                : 0;

        this.memoryKb =
            Number.isFinite(memoryKb)
                ? memoryKb
                : 0;

        this.lastError =
            errorMessage || "";

        this.updateStatusDisplay();
    }

    addEventListeners() {
        this.element.addEventListener(
            "pointerdown",
            (event) => {
                this.startDragging(event);
            }
        );

        this.element.addEventListener(
            "pointermove",
            (event) => {
                this.drag(event);
            }
        );

        this.element.addEventListener(
            "pointerup",
            (event) => {
                this.stopDragging(event);
            }
        );

        this.element.addEventListener(
            "pointercancel",
            (event) => {
                this.stopDragging(event);
            }
        );

        this.element.addEventListener(
            "click",
            (event) => {
                event.stopPropagation();
                this.board.selectWidget(this);
                this.board.pinWidgetPeek(this);
            }
        );

        this.element.addEventListener(
            "contextmenu",
            (event) => {
                event.preventDefault();
                event.stopPropagation();

                this.board.showWidgetContextMenu(
                    this,
                    event.clientX,
                    event.clientY
                );
            }
        );

        this.element.addEventListener(
            "dblclick",
            (event) => {
                event.preventDefault();
                event.stopPropagation();

                this.board.openWidgetProperties(
                    this
                );
            }
        );

        this.element.addEventListener(
            "pointerenter",
            () => {
                this.board.startWidgetPeek(
                    this
                );
            }
        );

        this.element.addEventListener(
            "pointerleave",
            () => {
                this.board.stopWidgetPeek(
                    this
                );
            }
        );
    }

    startDragging(event) {
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.board.selectWidget(this);

        const pointer =
            this.board.screenToWorkspace(
                event.clientX,
                event.clientY
            );

        this.dragOffsetX =
            pointer.x - this.x;

        this.dragOffsetY =
            pointer.y - this.y;

        this.isDragging = true;
        this.dragPointerStartX =
            event.clientX;
        this.dragPointerStartY =
            event.clientY;
        this.broughtToFrontThisDrag =
            false;

        this.dragHistorySnapshot =
            this.board.createHistorySnapshot();

        this.element.classList.add(
            "dragging"
        );

        this.element.setPointerCapture(
            event.pointerId
        );
    }

    drag(event) {
        if (!this.isDragging) {
            return;
        }

        if (!this.broughtToFrontThisDrag) {
            const movementX =
                event.clientX -
                this.dragPointerStartX;

            const movementY =
                event.clientY -
                this.dragPointerStartY;

            const movementDistance =
                Math.hypot(
                    movementX,
                    movementY
                );

            if (movementDistance >= 4) {
                this.board.recordHistorySnapshot(
                    this.dragHistorySnapshot
                );

                this.board.bringWidgetToFront(
                    this
                );

                this.broughtToFrontThisDrag =
                    true;
            }
        }

        const pointer =
            this.board.screenToWorkspace(
                event.clientX,
                event.clientY
            );

        this.x =
            pointer.x -
            this.dragOffsetX;

        this.y =
            pointer.y -
            this.dragOffsetY;

        const width =
            this.element
                ? this.element.offsetWidth
                : 190;

        const height =
            this.element
                ? this.element.offsetHeight
                : 90;

        this.x = Math.max(
            0,
            Math.min(
                this.board.workspaceWidth -
                    width,
                this.x
            )
        );

        this.y = Math.max(
            0,
            Math.min(
                this.board.workspaceHeight -
                    height,
                this.y
            )
        );

        this.updatePosition();

        this.board.updateConnectionsForWidget(
            this
        );

        this.board.updateWidgetPeek();
        this.board.updateConnectionPeek();
        this.board.updateWorkflowMap();
    }

    stopDragging(event) {
        if (!this.isDragging) {
            return;
        }

        this.isDragging = false;
        this.element.classList.remove(
            "dragging"
        );

        if (
            this.element.hasPointerCapture(
                event.pointerId
            )
        ) {
            this.element.releasePointerCapture(
                event.pointerId
            );
        }

        this.board.updateStats();
        this.board.scheduleSave();

        this.broughtToFrontThisDrag =
            false;

        this.dragHistorySnapshot = null;
    }

    updatePosition() {
        if (!this.element) {
            return;
        }

        this.element.style.left =
            `${this.x}px`;

        this.element.style.top =
            `${this.y}px`;
    }

    setTitle(newTitle) {
        const trimmedTitle =
            String(newTitle).trim();

        if (trimmedTitle === "") {
            return;
        }

        this.title = trimmedTitle;
        this.refreshContent();
        this.board.scheduleSave();
    }

    setType(newType) {
        const trimmedType =
            String(newType).trim();

        if (trimmedType === "") {
            return;
        }

        this.type = trimmedType;

        if (this.type === "Decision") {
            this.ensureDecisionConfiguration(
                true
            );

            if (
                !this.language ||
                this.language === "Expression"
            ) {
                this.language =
                    "Pass-through";
            }
        } else {
            this.lastDecisionResult = null;
        }

        this.refreshContent();
        this.board.scheduleSave();
    }

    setSelected(isSelected) {
        if (!this.element) {
            return;
        }

        this.element.classList.toggle(
            "selected",
            isSelected
        );
    }

    getInputPortPosition(portId = null) {
        const element =
            this.getInputPortElement(
                portId
            );

        if (!element) {
            return {
                x: this.x,
                y: this.y
            };
        }

        const rect =
            element.getBoundingClientRect();

        return this.board.screenToWorkspace(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
        );
    }

    getOutputPortPosition(portId = null) {
        const element =
            this.getOutputPortElement(
                portId
            );

        if (!element) {
            return {
                x: this.x,
                y: this.y
            };
        }

        const rect =
            element.getBoundingClientRect();

        return this.board.screenToWorkspace(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
        );
    }

    getBounds() {
        if (!this.element) {
            return null;
        }

        const rect =
            this.element.getBoundingClientRect();

        const topLeft =
            this.board.screenToWorkspace(
                rect.left,
                rect.top
            );

        const bottomRight =
            this.board.screenToWorkspace(
                rect.right,
                rect.bottom
            );

        return {
            left: topLeft.x,
            top: topLeft.y,
            right: bottomRight.x,
            bottom: bottomRight.y,

            width:
                bottomRight.x -
                topLeft.x,

            height:
                bottomRight.y -
                topLeft.y,

            centerX:
                (
                    topLeft.x +
                    bottomRight.x
                ) / 2,

            centerY:
                (
                    topLeft.y +
                    bottomRight.y
                ) / 2
        };
    }


    ensureDecisionConfiguration(
        addMissingOutputs = false
    ) {
        if (this.type !== "Decision") {
            return;
        }

        if (addMissingOutputs) {
            this.ensurePortCounter();

            while (this.outputs.length < 2) {
                const defaultName =
                    this.outputs.length === 0
                        ? "true"
                        : "false";

                this.outputs.push(
                    this.createPortRecord(
                        "output",
                        defaultName
                    )
                );
            }
        }

        const outputIds =
            new Set(
                this.outputs.map(
                    (output) => output.id
                )
            );

        if (
            !this.decisionTrueOutputId ||
            !outputIds.has(
                this.decisionTrueOutputId
            )
        ) {
            this.decisionTrueOutputId =
                this.outputs[0]
                    ? this.outputs[0].id
                    : null;
        }

        if (
            !this.decisionFalseOutputId ||
            !outputIds.has(
                this.decisionFalseOutputId
            ) ||
            this.decisionFalseOutputId ===
                this.decisionTrueOutputId
        ) {
            const alternate =
                this.outputs.find(
                    (output) =>
                        output.id !==
                        this.decisionTrueOutputId
                );

            this.decisionFalseOutputId =
                alternate
                    ? alternate.id
                    : null;
        }
    }

    getDecisionTrueOutput() {
        return this.getOutputById(
            this.decisionTrueOutputId
        );
    }

    getDecisionFalseOutput() {
        return this.getOutputById(
            this.decisionFalseOutputId
        );
    }

    getDecisionSelectedOutput() {
        if (
            typeof this.lastDecisionResult !==
            "boolean"
        ) {
            return null;
        }

        return this.lastDecisionResult
            ? this.getDecisionTrueOutput()
            : this.getDecisionFalseOutput();
    }


    static getDataTypes() {
        return [
            "Any",
            "String",
            "Number",
            "Boolean",
            "Array",
            "JSON"
        ];
    }

    static normalizeDataType(dataType) {
        const normalized =
            String(dataType || "Any")
                .trim();

        return Widget.getDataTypes().includes(
            normalized
        )
            ? normalized
            : "Any";
    }

    static coerceValueToType(
        value,
        dataType = "Any"
    ) {
        const type =
            Widget.normalizeDataType(
                dataType
            );

        if (type === "Any") {
            return value;
        }

        if (type === "String") {
            if (
                value !== null &&
                typeof value === "object"
            ) {
                return JSON.stringify(value);
            }

            return value === null ||
                value === undefined
                ? ""
                : String(value);
        }

        if (type === "Number") {
            if (
                typeof value === "number" &&
                Number.isFinite(value)
            ) {
                return value;
            }

            const numberValue =
                Number(
                    typeof value === "string"
                        ? value.trim()
                        : value
                );

            if (!Number.isFinite(numberValue)) {
                throw new Error(
                    `Cannot convert ${Widget.formatValue(value)} to Number.`
                );
            }

            return numberValue;
        }

        if (type === "Boolean") {
            if (typeof value === "boolean") {
                return value;
            }

            if (typeof value === "number") {
                if (value === 1) {
                    return true;
                }

                if (value === 0) {
                    return false;
                }
            }

            const text =
                String(value)
                    .trim()
                    .toLowerCase();

            if (["true", "1", "yes", "on"].includes(text)) {
                return true;
            }

            if (["false", "0", "no", "off"].includes(text)) {
                return false;
            }

            throw new Error(
                `Cannot convert ${Widget.formatValue(value)} to Boolean.`
            );
        }

        if (type === "Array") {
            if (Array.isArray(value)) {
                return value;
            }

            if (typeof value === "string") {
                try {
                    const parsed =
                        JSON.parse(value);

                    if (Array.isArray(parsed)) {
                        return parsed;
                    }
                } catch (error) {
                    // Fall through to the typed error below.
                }
            }

            throw new Error(
                `Cannot convert ${Widget.formatValue(value)} to Array.`
            );
        }

        if (type === "JSON") {
            if (typeof value === "string") {
                try {
                    return JSON.parse(value);
                } catch (error) {
                    throw new Error(
                        `Cannot parse ${Widget.formatValue(value)} as JSON.`
                    );
                }
            }

            try {
                JSON.stringify(value);
                return value;
            } catch (error) {
                throw new Error(
                    `Value is not JSON-serializable.`
                );
            }
        }

        return value;
    }

    static canCoerceValueToType(
        value,
        dataType = "Any"
    ) {
        try {
            Widget.coerceValueToType(
                value,
                dataType
            );

            return true;
        } catch (error) {
            return false;
        }
    }

    static formatValue(value) {
        if (
            value === "" ||
            value === null ||
            value === undefined
        ) {
            return "<empty>";
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

        if (text.length > 32) {
            return `${text.slice(0, 29)}...`;
        }

        return text;
    }

    toJSON() {
        return {
            id: this.id,
            title: this.title,
            type: this.type,
            x: this.x,
            y: this.y,
            zIndex: this.zIndex,

            inputs:
                this.inputs.map(
                    (port) => ({
                        id: port.id,
                        name: port.name,
                        dataType:
                            Widget.normalizeDataType(
                                port.dataType
                            ),
                        value: port.value,
                        manualValue:
                            port.manualValue,
                        required:
                            port.required
                    })
                ),

            outputs:
                this.outputs.map(
                    (port) => ({
                        id: port.id,
                        name: port.name,
                        dataType:
                            Widget.normalizeDataType(
                                port.dataType
                            ),
                        value: port.value
                    })
                ),

            showStatus:
                this.showStatus,

            collapsed:
                this.collapsed,

            notes:
                this.notes,

            status:
                this.status,

            runtimeMs:
                this.runtimeMs,

            memoryKb:
                this.memoryKb,

            language:
                this.language,

            source:
                this.source,

            decisionExpression:
                this.decisionExpression,

            decisionTrueOutputId:
                this.decisionTrueOutputId,

            decisionFalseOutputId:
                this.decisionFalseOutputId,

            decisionPayloadMode:
                this.decisionPayloadMode,

            lastDecisionResult:
                this.lastDecisionResult,

            executionDelayMs:
                this.executionDelayMs,

            lastError:
                this.lastError
        };
    }
}
