
const GAME_ADDRESS = "0x8DCb72E4840f92dAadf271A942C023DBFCCE5cC1";
const STUD_ADDRESS = "0x87275649959D8975143936a62893Faae4515Bed1";
const TOKEN_ADDRESS = "0x0920A1Da9F967BF8860A51E6F686AD2c11Ce81e6";

const SEPOLIA_CHAIN_ID = 11155111n;

const GAME_ABI = [
    "function startSession()",
    "function play(uint8 action)",
    "function stud() view returns (address)",
    "function game() view returns (address)",
    "function players(address) view returns (uint256 score, uint256 completedSessions, uint8 actionsInSession, uint8 lastAction, bool sessionActive)"
];

const TOKEN_ABI = [
    "function balanceOf(address account) view returns (uint256)"
];

let provider;
let signer;
let playerAddress;
let gameContract;
let studToken;
let gameToken;
let playerState;

const $ = (id) => document.getElementById(id);

function setStatus(message) {
    $("status").textContent = message;
}

function setButtons() {
    const connected = Boolean(playerAddress && playerState);

    $("startButton").disabled =
        !connected || playerState.sessionActive;

    $("attackButton").disabled =
        !connected ||
        !playerState.sessionActive ||
        playerState.actionsInSession >= 3 ||
        playerState.lastAction === 1;

    $("defendButton").disabled =
        !connected ||
        !playerState.sessionActive ||
        playerState.actionsInSession >= 3;
}

async function connectWallet() {
    try {
        if (!window.ethereum) {
            throw new Error("Please install MetaMask.");
        }

        provider = new ethers.BrowserProvider(window.ethereum);

        await provider.send("eth_requestAccounts", []);

        const network = await provider.getNetwork();

        if (network.chainId !== SEPOLIA_CHAIN_ID) {
            playerAddress = null;
            playerState = null;
            setButtons();
            $("network").textContent = "Network: wrong network";
            throw new Error("Switch MetaMask to Sepolia.");
        }

        signer = await provider.getSigner();
        playerAddress = await signer.getAddress();

        gameContract = new ethers.Contract(
            GAME_ADDRESS,
            GAME_ABI,
            signer
        );

        studToken = new ethers.Contract(
            STUD_ADDRESS,
            TOKEN_ABI,
            provider
        );

        gameToken = new ethers.Contract(
            TOKEN_ADDRESS,
            TOKEN_ABI,
            provider
        );

        $("wallet").textContent = "Wallet: " + playerAddress;
        $("network").textContent = "Network: Sepolia";

        const [studAddress, gameAddress] = await Promise.all([
            gameContract.stud(),
            gameContract.game()
        ]);

        if (
            studAddress.toLowerCase() !== STUD_ADDRESS.toLowerCase() ||
            gameAddress.toLowerCase() !== TOKEN_ADDRESS.toLowerCase()
        ) {
            throw new Error("Token addresses do not match the game contract.");
        }

        await refreshGame();
        setStatus("Wallet connected successfully.");

    } catch (error) {
        setStatus(error.shortMessage || error.message || String(error));
    }
}

async function refreshGame() {
    if (!playerAddress || !provider) return;

    const network = await provider.getNetwork();

    if (network.chainId !== SEPOLIA_CHAIN_ID) {
        throw new Error("Switch MetaMask to Sepolia.");
    }

    const [studBalance, gameBalance, state] = await Promise.all([
        studToken.balanceOf(playerAddress),
        gameToken.balanceOf(playerAddress),
        gameContract.players(playerAddress)
    ]);

    playerState = {
        score: state[0],
        completedSessions: state[1],
        actionsInSession: Number(state[2]),
        lastAction: Number(state[3]),
        sessionActive: state[4]
    };

    $("balances").textContent =
        `STUD: ${ethers.formatUnits(studBalance, 18)} | ` +
        `GAME: ${ethers.formatUnits(gameBalance, 18)}`;

    $("score").textContent =
        "Score: " + playerState.score.toString();

    $("sessions").textContent =
        "Completed sessions: " +
        playerState.completedSessions.toString();

    $("actions").textContent =
        "Actions in current session: " +
        playerState.actionsInSession + " / 3";

    setButtons();
}

async function startSession() {
    try {
        setStatus("Waiting for transaction confirmation...");

        const tx = await gameContract.startSession();
        setStatus("Transaction sent: " + tx.hash);

        await tx.wait();

        await refreshGame();
        setStatus("Session started successfully. Tx: " + tx.hash);

    } catch (error) {
        setStatus(error.shortMessage || error.reason || error.message);
    }
}

async function playAction(action) {
    try {
        setStatus("Waiting for transaction confirmation...");

        const tx = await gameContract.play(action);
        setStatus("Transaction sent: " + tx.hash);

        await tx.wait();

        await refreshGame();

        const actionName = action === 1 ? "Attack" : "Defend";
        setStatus(actionName + " recorded on-chain. Tx: " + tx.hash);

    } catch (error) {
        setStatus(error.shortMessage || error.reason || error.message);
        await refreshGame().catch(() => {});
    }
}

$("connectButton").addEventListener("click", connectWallet);
$("startButton").addEventListener("click", startSession);
$("attackButton").addEventListener("click", () => playAction(1));
$("defendButton").addEventListener("click", () => playAction(2));

if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => location.reload());
    window.ethereum.on("chainChanged", () => location.reload());
}
