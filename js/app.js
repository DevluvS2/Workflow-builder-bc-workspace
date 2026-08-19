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
    120,
    120
);

const processWidget = new Widget(
    board,
    "widget-2",
    "Process Request",
    "Process",
    380,
    220
);

const endWidget = new Widget(
    board,
    "widget-3",
    "Finish",
    "End",
    650,
    350
);

board.addWidget(startWidget);
board.addWidget(processWidget);
board.addWidget(endWidget);

board.nextWidgetNumber = 4;