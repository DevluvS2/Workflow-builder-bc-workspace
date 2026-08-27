class Connection {
    constructor(
        board,
        id,
        sourceWidget,
        targetWidget,
        sourcePortId = null,
        targetPortId = null
    ) {
        this.board = board;
        this.id = id;

        this.sourceWidget =
            sourceWidget;

        this.targetWidget =
            targetWidget;

        this.sourcePortId =
            sourcePortId ||
            (sourceWidget.outputs[0]
                ? sourceWidget.outputs[0].id
                : null);

        this.targetPortId =
            targetPortId ||
            (targetWidget.inputs[0]
                ? targetWidget.inputs[0].id
                : null);

        this.element = null;

        this.hitElement = null;
        this.groupElement = null;
    }


    render() {
        const svgNamespace =
            "http://www.w3.org/2000/svg";


        /*
        * Group the visible line and its
        * invisible interaction path together.
        */
        const group =
            document.createElementNS(
                svgNamespace,
                "g"
            );

        group.classList.add(
            "workflow-connection-group"
        );


        /*
        * Actual visible connection.
        */
        const path =
            document.createElementNS(
                svgNamespace,
                "path"
            );

        path.classList.add(
            "workflow-connection"
        );

        path.setAttribute(
            "marker-end",
            "url(#connection-arrow)"
        );

        path.dataset.connectionId =
            this.id;


        /*
        * Invisible wider path.
        *
        * This makes the thin connection
        * much easier to hover.
        */
        const hitPath =
            document.createElementNS(
                svgNamespace,
                "path"
            );

        hitPath.classList.add(
            "connection-hit-path"
        );

        hitPath.dataset.connectionId =
            this.id;


        /*
        * Hovering the invisible hit path
        * activates Connection Peek Mode.
        */
        hitPath.addEventListener(
            "pointerenter",
            () => {
                this.board.startConnectionPeek(
                    this
                );
            }
        );

        hitPath.addEventListener(
            "pointerleave",
            () => {
                this.board.stopConnectionPeek(
                    this
                );
            }
        );

        hitPath.addEventListener(
            "click",
            (event) => {
                event.preventDefault();
                event.stopPropagation();

                this.board.selectConnection(
                    this
                );
            }
        );

        hitPath.addEventListener(
            "contextmenu",
            (event) => {
                event.preventDefault();
                event.stopPropagation();

                this.board.showConnectionContextMenu(
                    this,
                    event.clientX,
                    event.clientY
                );
            }
        );


        group.appendChild(path);
        group.appendChild(hitPath);


        this.element = path;
        this.hitElement = hitPath;
        this.groupElement = group;


        this.update();

        return group;
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
            this.sourceWidget
                .getOutputPortPosition(
                    this.sourcePortId
                );

        const rawTargetPoint =
            this.targetWidget
                .getInputPortPosition(
                    this.targetPortId
                );


        /*
         * Get actual widget boundaries when
         * getBounds() is available.
         */
        const sourceBounds =
            typeof this.sourceWidget.getBounds ===
                "function"
                ? this.sourceWidget.getBounds()
                : null;

        const targetBounds =
            typeof this.targetWidget.getBounds ===
                "function"
                ? this.targetWidget.getBounds()
                : null;


        /*
         * Stop slightly before the input circle
         * so the arrowhead doesn't cover it.
         */
        const targetPoint = {
            x: rawTargetPoint.x - 8,
            y: rawTargetPoint.y
        };


        const pathData =
            Connection.createPath(
                sourcePoint,
                targetPoint,
                sourceBounds,
                targetBounds
            );

        this.element.setAttribute(
            "d",
            pathData
        );

        if (this.hitElement) {
            this.hitElement.setAttribute(
                "d",
                pathData
            );
        }
    }


    static createPath(
        sourcePoint,
        targetPoint,
        sourceBounds = null,
        targetBounds = null
    ) {
        const sourceX =
            sourcePoint.x;

        const sourceY =
            sourcePoint.y;

        const targetX =
            targetPoint.x;

        const targetY =
            targetPoint.y;


        /*
         * CASE 1:
         * Normal left-to-right connection.
         */
        if (targetX >= sourceX) {
            const distance =
                targetX - sourceX;

            const curve =
                Math.max(
                    50,
                    distance * 0.45
                );

            return (
                `M ${sourceX} ${sourceY} ` +
                `C ${sourceX + curve} ${sourceY}, ` +
                `${targetX - curve} ${targetY}, ` +
                `${targetX} ${targetY}`
            );
        }


        /*
         * Safe fallback.
         *
         * This also means connection drawing won't
         * completely break if getBounds() hasn't
         * been added to Widget yet.
         */
        if (
            !sourceBounds ||
            !targetBounds
        ) {
            const distance =
                Math.abs(
                    sourceX - targetX
                );

            const curve =
                Math.max(
                    60,
                    distance * 0.4
                );

            return (
                `M ${sourceX} ${sourceY} ` +
                `C ${sourceX + curve} ${sourceY}, ` +
                `${targetX - curve} ${targetY}, ` +
                `${targetX} ${targetY}`
            );
        }


        const horizontalPadding = 35;
        const outerPadding = 30;
        const cornerRadius = 16;

        const sourceExitX =
            sourceX +
            horizontalPadding;

        const targetEntryX =
            targetX -
            horizontalPadding;


        /*
         * Which half of the source widget is
         * the target sitting underneath/above?
         */
        const targetIsInLeftHalf =
            targetBounds.centerX <
            sourceBounds.centerX;


        /*
         * Calculate the actual empty vertical
         * space between the two widgets.
         */
        let verticalGap = 0;

        if (
            targetBounds.top >=
            sourceBounds.bottom
        ) {
            verticalGap =
                targetBounds.top -
                sourceBounds.bottom;
        } else if (
            sourceBounds.top >=
            targetBounds.bottom
        ) {
            verticalGap =
                sourceBounds.top -
                targetBounds.bottom;
        }


        /*
         * Middle routing becomes ugly when
         * the widgets are too close together.
         */
        const minimumGapForMiddleRoute =
            45;

        const enoughVerticalSpace =
            verticalGap >=
            minimumGapForMiddleRoute;


        /*
         * Desired behavior:
         *
         * Left half  -> outer-left route
         *
         * Right half + enough gap
         *            -> middle route
         *
         * Right half + too close
         *            -> outer-left route
         */
        const useOuterLeftRoute =
            targetIsInLeftHalf ||
            !enoughVerticalSpace;


        /*
         * CASE 2:
         * OUTER-LEFT ROUTE
         *
         * This is the routing you wanted for
         * your 2nd ss.
         */
        if (useOuterLeftRoute) {
            const outerLeftX =
                Math.min(
                    sourceBounds.left,
                    targetBounds.left
                ) - outerPadding;


            const targetIsBelow =
                targetBounds.centerY >
                sourceBounds.centerY;


            /*
             * Target below:
             * route above source first.
             *
             * Target above:
             * route underneath source first.
             */
            const outerY =
                targetIsBelow
                    ? sourceBounds.top -
                        outerPadding
                    : sourceBounds.bottom +
                        outerPadding;


            const sourceVerticalDirection =
                outerY > sourceY
                    ? 1
                    : -1;


            const targetVerticalDirection =
                targetY > outerY
                    ? 1
                    : -1;


            return (
                `M ${sourceX} ${sourceY} ` +

                /*
                 * Leave source to the right.
                 */
                `L ${sourceExitX - cornerRadius} ${sourceY} ` +

                /*
                 * Round first corner.
                 */
                `Q ${sourceExitX} ${sourceY}, ` +
                `${sourceExitX} ${
                    sourceY +
                    cornerRadius *
                    sourceVerticalDirection
                } ` +

                /*
                 * Travel outside the source.
                 */
                `L ${sourceExitX} ${
                    outerY -
                    cornerRadius *
                    sourceVerticalDirection
                } ` +

                /*
                 * Turn toward the left edge.
                 */
                `Q ${sourceExitX} ${outerY}, ` +
                `${sourceExitX - cornerRadius} ${outerY} ` +

                /*
                 * Travel across the outside.
                 */
                `L ${outerLeftX + cornerRadius} ${outerY} ` +

                /*
                 * Turn down/up beside the widgets.
                 */
                `Q ${outerLeftX} ${outerY}, ` +
                `${outerLeftX} ${
                    outerY +
                    cornerRadius *
                    targetVerticalDirection
                } ` +

                /*
                 * Travel alongside left edge.
                 */
                `L ${outerLeftX} ${
                    targetY -
                    cornerRadius *
                    targetVerticalDirection
                } ` +

                /*
                 * Turn into the target input.
                 */
                `Q ${outerLeftX} ${targetY}, ` +
                `${outerLeftX + cornerRadius} ${targetY} ` +

                `L ${targetX} ${targetY}`
            );
        }


        /*
         * CASE 3:
         * MIDDLE-GAP ROUTE
         *
         * Target is on the right half AND
         * there is enough vertical space.
         *
         * This matches your 3rd ss.
         */
        const targetIsBelow =
            targetBounds.centerY >
            sourceBounds.centerY;


        const middleY =
            targetIsBelow
                ? (
                    sourceBounds.bottom +
                    targetBounds.top
                ) / 2
                : (
                    targetBounds.bottom +
                    sourceBounds.top
                ) / 2;


        const directionY =
            targetIsBelow
                ? 1
                : -1;


        return (
            `M ${sourceX} ${sourceY} ` +

            /*
             * Exit source toward right.
             */
            `L ${sourceExitX - cornerRadius} ${sourceY} ` +

            `Q ${sourceExitX} ${sourceY}, ` +
            `${sourceExitX} ${
                sourceY +
                cornerRadius *
                directionY
            } ` +

            /*
             * Move into empty vertical gap.
             */
            `L ${sourceExitX} ${
                middleY -
                cornerRadius *
                directionY
            } ` +

            /*
             * Turn left.
             */
            `Q ${sourceExitX} ${middleY}, ` +
            `${sourceExitX - cornerRadius} ${middleY} ` +

            /*
             * Travel toward target.
             */
            `L ${targetEntryX + cornerRadius} ${middleY} ` +

            /*
             * Turn toward target vertically.
             */
            `Q ${targetEntryX} ${middleY}, ` +
            `${targetEntryX} ${
                middleY +
                cornerRadius *
                directionY
            } ` +

            /*
             * Approach target input.
             */
            `L ${targetEntryX} ${
                targetY -
                cornerRadius *
                directionY
            } ` +

            /*
             * Final turn into input.
             */
            `Q ${targetEntryX} ${targetY}, ` +
            `${targetEntryX + cornerRadius} ${targetY} ` +

            `L ${targetX} ${targetY}`
        );
    }


    remove() {
        if (this.groupElement) {
            this.groupElement.remove();
        } else {
            if (this.element) {
                this.element.remove();
            }

            if (this.hitElement) {
                this.hitElement.remove();
            }
        }

        this.element = null;
        this.hitElement = null;
        this.groupElement = null;
    }


    toJSON() {
        return {
            id: this.id,

            sourceWidgetId:
                this.sourceWidget.id,

            sourcePortId:
                this.sourcePortId,

            targetWidgetId:
                this.targetWidget.id,

            targetPortId:
                this.targetPortId
        };
    }
}