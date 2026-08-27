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
        this.titleElement = null;
        this.contentElement = null;
        this.statusElement = null;

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

        this.showStatus = true;
        this.runtimeMs = 0;
        this.memoryKb = 0;
        this.lastError = "";

        /*
         * Script configuration. The Board owns execution.
         * Bash/Python/JavaScript are intentionally interpreted
         * by the local workflow simulator rather than executed
         * as unrestricted system processes.
         */
        this.language =
            type === "Start" || type === "End"
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

        this.inputs = [
            this.createPortRecord(
                "input",
                "value"
            )
        ];

        this.outputs = [
            this.createPortRecord(
                "output",
                this.type === "Decision"
                    ? "result"
                    : "result"
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
                value: "",
                manualValue: "",
                required: true
            };
        }

        return {
            id,
            name,
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

        this.ensurePortCounter();

        if (this.element) {
            this.refreshContent();
        }
    }

    render() {
        const element =
            document.createElement("div");

        element.className = "widget";
        element.dataset.widgetId = this.id;

        const titleElement =
            document.createElement("div");

        titleElement.className =
            "widget-title";

        const contentElement =
            document.createElement("div");

        contentElement.className =
            "widget-content widget-io-content";

        const statusElement =
            document.createElement("div");

        statusElement.className =
            "widget-status";

        element.appendChild(
            titleElement
        );

        element.appendChild(
            contentElement
        );

        element.appendChild(
            statusElement
        );

        this.element = element;
        this.titleElement = titleElement;
        this.contentElement = contentElement;
        this.statusElement = statusElement;

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

                const text =
                    document.createElement(
                        "span"
                    );

                text.className =
                    "widget-io-text";

                const prefix =
                    direction === "input"
                        ? "In"
                        : "Out";

                text.textContent =
                    `${prefix} ${port.name}: ${Widget.formatValue(port.value)}`;

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

                portButton.title =
                    `${direction === "input" ? "Input" : "Output"}: ${port.name}`;

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
        if (!this.statusElement) {
            return;
        }

        const allowedStatuses = [
            "idle",
            "waiting",
            "running",
            "finished",
            "error",
            "stopped"
        ];

        allowedStatuses.forEach(
            (status) => {
                this.statusElement.classList.remove(
                    `status-${status}`
                );
            }
        );

        const normalizedStatus =
            allowedStatuses.includes(
                this.status
            )
                ? this.status
                : "idle";

        this.statusElement.classList.add(
            `status-${normalizedStatus}`
        );

        if (this.element) {
            this.element.dataset.status =
                normalizedStatus;
        }

        this.statusElement.hidden =
            !this.showStatus;

        let text =
            `status: ${normalizedStatus}` +
            `  ·  ${Math.round(this.runtimeMs)} ms` +
            `  ·  ${this.memoryKb.toFixed(1)} KB`;

        if (
            normalizedStatus === "error" &&
            this.lastError
        ) {
            text +=
                `  ·  ${this.lastError}`;
        }

        this.statusElement.textContent =
            text;
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
                        value: port.value
                    })
                ),

            showStatus:
                this.showStatus,

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

            executionDelayMs:
                this.executionDelayMs,

            lastError:
                this.lastError
        };
    }
}
