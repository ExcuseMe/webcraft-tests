const missed_messages = []

async function onMissedMessage(msg) {
    missed_messages.push(msg)
}

if (typeof process == 'undefined') {
    onmessage = onMissedMessage
}

process.on("uncaughtException", err => {
    console.error("Uncaught:", err)
    console.error(err.stack)
})

process.on("unhandledRejection", err => {
    console.error("Unhandled:", err)
    console.error(err.stack)
})

globalThis.localStorage = {
    items: {},
    getItem(key) {
        return this.items[key]
    },
    setItem(key, value) {
        this.items[key] = value
    }
}

import('../js/webcraft-tests/src/bot_game.js').then(module => {
    const game = new module.BotGame()
    globalThis.Qubatch = game
    game.init(missed_messages).then()
})