export const state = {
  route: "today",
  boards: [],
  today: null,
  selectedBoardId: null,
  undo: null,
};

export function setBoards(boards) {
  state.boards = boards;
  if (!boards.some((board) => board.id === state.selectedBoardId)) {
    state.selectedBoardId = boards[0]?.id ?? null;
  }
}

export function setToday(today) {
  state.today = today;
}

export function setUndo(action) {
  state.undo = action;
}
