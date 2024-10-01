import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  },
});

app.use(cors());

let groups = {};
let availableGroups = [];

function resetGame(groupName) {
  if (groups[groupName]) {
    groups[groupName].markedCells.clear(); // Clear marked cells
    groups[groupName].winner = null;
    groups[groupName].gameStarted = false;
    groups[groupName].currentPlayerIndex = 0;
    groups[groupName].boards = {}; // Reset boards

    // Emit reset event to all players in the group
    io.to(groupName).emit("gameReset", groups[groupName].players);
    console.log(`Game reset for group ${groupName}`);
  } else {
    console.log(`Group ${groupName} not found`);
  }
}

function generateGameBoard() {
  const numbers = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  return Array.from({ length: 5 }, (_, i) => numbers.slice(i * 5, i * 5 + 5));
}

const notifyGroupUpdates = () => {
  io.emit("updateGroups", availableGroups);
};

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  socket.on("createGroup", (groupName, callback) => {
    if (!groups[groupName]) {
      groups[groupName] = {
        players: [socket.id],
        boards: {},
        status: "waiting",
        currentPlayerIndex: 0,
        gameStarted: false,
        markedCells: new Set(), // Store marked cells for this group
      };
      availableGroups.push(groupName);
      socket.join(groupName);
      notifyGroupUpdates();
      callback({ success: true, message: "Group created successfully." });
    } else {
      callback({ success: false, message: "Group already exists." });
    }
  });

  socket.on("joinGroup", (groupName, callback) => {
    if (groups[groupName] && groups[groupName].status === "waiting") {
      groups[groupName].players.push(socket.id);
      socket.join(groupName);
      callback({ success: true, players: groups[groupName].players });
      io.to(groupName).emit("playerJoined", groups[groupName].players);
    } else {
      callback({ success: false, message: "Cannot join group." });
    }
  });

  socket.on("startGame", (groupName) => {
    const group = groups[groupName];
    if (group && group.players.length >= 2) {
      group.gameStarted = true;

      // Generate boards for each player
      group.players.forEach((playerId) => {
        group.boards[playerId] = generateGameBoard();
      });

      io.to(groupName).emit("gameStarted", group.boards, group.players);
      console.log("Game started for group:", groupName);
    } else {
      console.log(
        `Cannot start game: not enough players in group ${groupName}.`
      );
    }
  });

  socket.on("markCell", (groupName, number, callback) => {
    const group = groups[groupName];
    if (group && group.gameStarted) {
      const playerId = group.players[group.currentPlayerIndex];

      // Allow only the current player to mark the cell
      if (socket.id === playerId) {
        if (!group.markedCells.has(number)) {
          group.markedCells.add(number); // Use group's markedCells set
          io.to(groupName).emit("cellMarked", { number });
          checkForBingo(group, number);
          callback({ success: true });
        } else {
          callback({ success: false, message: "Cell already marked!" });
        }
      } else {
        callback({ success: false, message: "It's not your turn!" });
      }
    } else {
      callback({ success: false, message: "Game has not started!" });
    }
  });

  socket.on("resetGame", (groupName, callback) => {
    console.log("Received request to reset game for group:", groupName);
    const group = groups[groupName];
    if (group && group.players[0] === socket.id) {
      resetGame(groupName);
      callback({ success: true });
    } else {
      callback({
        success: false,
        message: "Only the group creator can reset the game.",
      });
    }
  });

  socket.on("resetGame", (groupName, callback) => {
    resetGame(groupName);
    callback({ success: true });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
    Object.keys(groups).forEach((groupName) => {
      const group = groups[groupName];
      if (group) {
        group.players = group.players.filter((player) => player !== socket.id);
        if (group.players.length === 0) {
          delete groups[groupName];
          availableGroups = availableGroups.filter((g) => g !== groupName);
          notifyGroupUpdates();
        } else {
          io.to(groupName).emit("playerJoined", group.players);
        }
      }
    });
  });
});

const checkForBingo = (group, lastMarkedNumber) => {
  const playerId = group.players[group.currentPlayerIndex];
  const playerBoard = group.boards[playerId];

  // Create a flat array of marked numbers for easy checking
  const markedNumbers = Array.from(group.markedCells);
  const rows = playerBoard;
  const columns = playerBoard[0].map((_, colIndex) =>
    playerBoard.map((row) => row[colIndex])
  );
  const diagonals = [
    playerBoard.map((row, index) => row[index]),
    playerBoard.map((row, index) => row[playerBoard.length - 1 - index]),
  ];

  const checkLines = (lines) =>
    lines.filter((line) => line.every((num) => markedNumbers.includes(num)))
      .length;

  const completedRows = checkLines(rows);
  const completedColumns = checkLines(columns);
  const completedDiagonals = checkLines(diagonals);

  const totalCompletedLines =
    completedRows + completedColumns + completedDiagonals;

  // If the player completes 5 lines, declare a win
  if (totalCompletedLines >= 5) {
    console.log(group, "group");
    io.to(group.players).emit("gameWon", playerId); // Use the playerId directly
  } else {
    // Move to the next player
    group.currentPlayerIndex =
      (group.currentPlayerIndex + 1) % group.players.length;
    const nextPlayer = group.players[group.currentPlayerIndex];

    // Emit the nextTurn event with the next player
    io.to(group.players).emit("nextTurn", nextPlayer); // Use the group object to emit
  }
};

server.listen(3001, () => {
  console.log("Server is running on port 3001");
});
