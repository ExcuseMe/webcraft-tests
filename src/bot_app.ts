import type {BotGame} from "./bot_game.js";
import {API_URL} from "./constant.js";
import {UIApp} from "@client/ui/app.js";

// App
export class BotUIApp extends UIApp {

    readonly game: BotGame

    constructor(game: BotGame) {
        super(API_URL)
        this.game = game
    }

    logout(): void { }

    showError(message: string, unused_argument?: int): void { }

    /**
     * Выполняет все необходимые обращения к мастер-серверу для начала игры.
     * Регистрирует пользователя, входит и запрашивает вход в мир.
     */
    async enter(username: string, password: string): Promise<IWorldEnterParams> {
        await this.Registration({username, password}) // Error is expected and ok

        await this.Login({username, password}, null, (err) => {
            console.error('Login error:', err)
            process.exit()
        })

        const form: IEnterWorld = {
            options: this.game.settings,
            world_guid: this.game.init_params.world_guid,
            location: {
                protocol: 'http:',
                hostname: 'localhost',
            }
        }
        return new Promise<IWorldEnterParams>((resolve, reject) => {
            const tryEnter = () => {
                this.EnterToWorld(form, resolve, (err) => {
                    if (err.message === 'error_no_world_servers') {
                        console.log('error_no_world_servers, retrying')
                        setTimeout(tryEnter, 3000)
                    } else {
                        reject(err)
                    }
                })
            }
            tryEnter()
        })
    }

}