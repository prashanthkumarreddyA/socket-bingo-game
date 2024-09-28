import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const socket = io("http://localhost:3001");

function App() {
  const [groupName, setGroupName] = useState("");
  const [inGroup, setInGroup] = useState(false);
  const [players, setPlayers] = useState([]);
  const [board, setBoard] = useState([]);
  const [markedCells, setMarkedCells] = useState(new Set());
  const [gameStarted, setGameStarted] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [winner, setWinner] = useState("");
  const [groups, setGroups] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState("");
  const [myTurn, setMyTurn] = useState(false);
  const [isGroupCreator, setIsGroupCreator] = useState(false);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    socket.on("connect", () => {
      const assignedId = socket.id;
      setUserId(assignedId);
    });

    socket.on("gameStarted", (boards, players) => {
      const playerBoard = boards[socket.id];
      if (playerBoard) {
        setBoard(playerBoard);
        setPlayers(players);
        setGameStarted(true);
      }
    });

    socket.on("playerJoined", (players) => {
      setPlayers(players);
    });

    socket.on("cellMarked", ({ number }) => {
      setMarkedCells((prev) => new Set(prev).add(number));
    });

    socket.on("gameWon", (winnerId) => {
      setWinner(winnerId);
      setGameWon(true);
      alert(`Player ${winnerId} has won!`);
    });

    socket.on("nextTurn", (playerId) => {
      setCurrentPlayer(playerId);
      setMyTurn(socket.id === playerId); // Check if it's now this player's turn
    });

    socket.on("updateGroups", (availableGroups) => {
      setGroups(availableGroups);
    });

    return () => {
      socket.off("connect");
      socket.off("gameStarted");
      socket.off("playerJoined");
      socket.off("cellMarked");
      socket.off("gameWon");
      socket.off("nextTurn");
      socket.off("updateGroups");
    };
  }, []);

  const createGroup = () => {
    socket.emit("createGroup", groupName, (response) => {
      if (response.success) {
        setInGroup(true);
        setPlayers([userId]);
        setIsGroupCreator(true);
      } else {
        alert(response.message);
      }
    });
  };

  const joinGroup = (group) => {
    socket.emit("joinGroup", group, (response) => {
      if (response.success) {
        setInGroup(true);
        setPlayers(response.players);
        setGroupName(group);
        setIsGroupCreator(false);
      } else {
        alert(response.message);
      }
    });
  };

  const startGame = () => {
    if (players.length >= 2) {
      socket.emit("startGame", groupName);
      setCurrentPlayer(players[0]);
      setMyTurn(socket.id === players[0]);
    } else {
      alert("Not enough players to start the game.");
    }
  };

  const markCell = (number) => {
    if (gameStarted) {
      if (myTurn) {
        if (!markedCells.has(number)) {
          socket.emit("markCell", groupName, number, (response) => {
            if (response.success) {
              setMarkedCells((prev) => new Set(prev).add(number));
            } else {
              alert(response.message);
            }
          });
        } else {
          alert("Cell already marked!");
        }
      } else {
        alert("It's not your turn!");
      }
    } else {
      alert("The game hasn't started yet.");
    }
  };

  return (
    <div className="container mx-auto p-6">
      {!inGroup ? (
        <div>
          <h2>Available Groups</h2>
          <ul>
            {groups.map((group) => (
              <li key={group}>
                {group} <button onClick={() => joinGroup(group)}>Join</button>
              </li>
            ))}
          </ul>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Enter Group Name"
          />
          <button onClick={createGroup}>Create Group</button>
        </div>
      ) : (
        <div>
          <h2>Players: {players.join(", ")}</h2>
          <h3>Your User ID: {userId}</h3>
          {gameStarted ? (
            <>
              <h3>Bingo Board</h3>
              <table>
                <tbody>
                  {board.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell) => (
                        <td
                          key={cell}
                          onClick={() => markCell(cell)}
                          className={markedCells.has(cell) ? "marked" : ""}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3>
                Status:{" "}
                {gameWon
                  ? `Winner: ${winner}`
                  : `Current Player: ${currentPlayer} ${
                      myTurn ? "(Your Turn)" : "(Waiting for Next Turn)"
                    }`}
              </h3>
            </>
          ) : (
            isGroupCreator && <button onClick={startGame}>Start Game</button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
