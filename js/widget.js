class Widget {
    constructor(board, id, title, type, x, y) {
        this.board = board;

        this.id = id;
        this.title = title;
        this.type = type;

        this.x = x;
        this.y = y;

        this.element = null;

        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
    }

    render() {
        const element = document.createElement("div");

        element.className = "widget";
        element.dataset.widgetId = this.id;

        const titleElement = document.createElement("div");
        titleElement.className = "widget-title";
        titleElement.textContent = this.title;

        const contentElement = document.createElement("div");
        contentElement.className = "widget-content";
        contentElement.textContent = `Type: ${this.type}`;

        element.appendChild(titleElement);
        element.appendChild(contentElement);

        this.element = element;
        this.titleElement = titleElement;
        this.contentElement = contentElement;

        this.updatePosition();
        this.addEventListeners();

        return element;
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

    }

    startDragging(event) {
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.board.selectWidget(this);

        const pointer = this.board.screenToWorkspace(
            event.clientX,
            event.clientY
        );

        this.dragOffsetX = pointer.x - this.x;
        this.dragOffsetY = pointer.y - this.y;

        this.isDragging = true;
        this.element.classList.add("dragging");

        this.element.setPointerCapture(event.pointerId);
    }

    drag(event) {
        if (!this.isDragging) {
            return;
        }

        const pointer = this.board.screenToWorkspace(
            event.clientX,
            event.clientY
        );

        this.x = pointer.x - this.dragOffsetX;
        this.y = pointer.y - this.dragOffsetY;

        /*
         * Prevent the widget from moving beyond the workspace's
         * top and left boundaries.
         */
        this.x = Math.max(0, this.x);
        this.y = Math.max(0, this.y);

        this.updatePosition();
        this.board.updateWorkflowMap();
    }

    stopDragging(event) {
        if (!this.isDragging) {
            return;
        }

        this.isDragging = false;
        this.element.classList.remove("dragging");

        if (this.element.hasPointerCapture(event.pointerId)) {
            this.element.releasePointerCapture(event.pointerId);
        }

        this.board.updateStats();
        this.board.scheduleSave();
    }

    updatePosition() {
        if (!this.element) {
            return;
        }

        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
    }

    setTitle(newTitle) {
        const trimmedTitle = newTitle.trim();

        if (trimmedTitle === "") {
            return;
        }

        this.title = trimmedTitle;

        if (this.titleElement) {
            this.titleElement.textContent = this.title;
        }

        this.board.updateWorkflowMap();
        this.board.scheduleSave();
    }

    setType(newType) {
        const trimmedType = newType.trim();

        if (trimmedType === "") {
            return;
        }

        this.type = trimmedType;

        if (this.contentElement) {
            this.contentElement.textContent = `Type: ${this.type}`;
        }

        this.board.scheduleSave();
    }

    setSelected(isSelected) {
        if (!this.element) {
            return;
        }

        this.element.classList.toggle("selected", isSelected);
    }

    toJSON() {
        return {
            id: this.id,
            title: this.title,
            type: this.type,
            x: this.x,
            y: this.y
        };
    }
}