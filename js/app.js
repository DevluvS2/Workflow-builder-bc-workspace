const appElement = document.getElementById("app");

const board = new Board(appElement);

/*
 * Add a few starter widgets so the application has an
 * example workflow when it first opens.
 */
const startWidget = new Widget(
    board,
    "widget-1",
    "Start",
    "Start",
    2600,
    1950
);

const processWidget = new Widget(
    board,
    "widget-2",
    "Process Request",
    "Process",
    2900,
    1950
);

const endWidget = new Widget(
    board,
    "widget-3",
    "Finish",
    "End",
    3200,
    1950
);

board.addWidget(startWidget);
board.addWidget(processWidget);
board.addWidget(endWidget);

board.nextWidgetNumber = 4;

/*
 * Always start the application looking at
 * the center of the workspace.
 */
board.centerWorkspace();