const appElement =
    document.getElementById("app");

const board =
    new Board(appElement);

const restored =
    board.loadState();

if (!restored) {
    const startWidget =
        new Widget(
            board,
            "widget-1",
            "Start",
            "Start",
            2700,
            1900
        );

    const processWidget =
        new Widget(
            board,
            "widget-2",
            "Process Request",
            "Process",
            3000,
            1900
        );

    const endWidget =
        new Widget(
            board,
            "widget-3",
            "Finish",
            "End",
            3300,
            1900
        );

    board.addWidget(startWidget);
    board.addWidget(processWidget);
    board.addWidget(endWidget);

    board.nextWidgetNumber = 4;

    board.centerWorkspace();
    board.saveState();

    board.saveState();
}