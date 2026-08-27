class Connection {
    constructor(
        board,
        id,
        sourceWidget,
        targetWidget
    ) {
        this.board = board;
        this.id = id;

        this.sourceWidget =
            sourceWidget;

        this.targetWidget =
            targetWidget;

        this.element = null;
    }

    render() {
        const svgNamespace =
            "http://www.w3.org/2000/svg";

        const path =
            document.createElementNS(
                svgNamespace,
                "path"
            );

        path.classList.add(
            "workflow-connection"
        );

        path.dataset.connectionId =
            this.id;

        this.element = path;

        this.update();

        return path;
    }

    update() {
        if (
            !this.element ||
            !this.sourceWidget ||
            !this.targetWidget
        ) {
            return;
        }

        const sourcePoint =
            this.sourceWidget.getOutputPortPosition();

        const targetPoint =
            this.targetWidget.getInputPortPosition();

        const pathData =
            Connection.createPath(
                sourcePoint,
                targetPoint
            );

        this.element.setAttribute(
            "d",
            pathData
        );
    }

    remove() {
        if (this.element) {
            this.element.remove();
        }

        this.element = null;
    }

    static createPath(
        sourcePoint,
        targetPoint
    ) {
        const horizontalDistance =
            Math.abs(
                targetPoint.x -
                sourcePoint.x
            );

        const curveAmount =
            Math.max(
                60,
                horizontalDistance * 0.5
            );

        const direction =
            targetPoint.x >= sourcePoint.x
                ? 1
                : -1;

        const firstControlX =
            sourcePoint.x +
            curveAmount * direction;

        const secondControlX =
            targetPoint.x -
            curveAmount * direction;

        return (
            `M ${sourcePoint.x} ${sourcePoint.y} ` +
            `C ${firstControlX} ${sourcePoint.y}, ` +
            `${secondControlX} ${targetPoint.y}, ` +
            `${targetPoint.x} ${targetPoint.y}`
        );
    }
}