class Board {
    constructor(rootElement) {
        this.rootElement = rootElement;
        this.widgets = [];

        this.leftPanelVisible = true;
        this.rightPanelVisible = true;

        this.render();
    }

    render() {
        this.rootElement.innerHTML = "";

        const boardElement = document.createElement("div");
        boardElement.className = "board";

        this.rootElement.appendChild(boardElement);
        
        this.boardElement = boardElement;
    }
}