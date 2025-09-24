import {QubatchWorker} from "@client/helpers/qubatch_worker.js";
import {WORKER_MESSAGES, WorkerInitParams} from "./types.js";
import {BotPlayer} from "./bot_player.js";
import {GameSettings} from "@client/game_settings.js";
import {BlockManager} from "@client/blocks.js";
import {BotWorld} from "./bot_world.js";
import {BotUIApp} from "./bot_app.js";
import {WebSocket} from "ws";
import {PASSWORD, VIEW_DISTANCE_BLOCKS} from "./constant.js";
import {Helpers} from "@client/helpers.js";
import {NetworkHelpers} from "@client/helpers/network_helpers.js";
import {WEBSOCKET_READY_STATE, WebSocketTemporaryHolder} from "@client/helpers/websocket.js";
import {MAX_FPS_DELTA_PROCESSED, PHYSICS_INTERVAL_MS, PROXY_PING_PACKET} from "@client/constant.js";
import {setInterval} from "timers";

export class BotGame extends QubatchWorker {
    settings                = new GameSettings()
    block_manager:          BlockManager
    world:                  BotWorld
    player:                 BotPlayer
    app                     = new BotUIApp(this)
    ws:                     WebSocket
    init_params:            WorkerInitParams
    pn_frame:               float | null = null
    new_mode_logic_clock    = false
    readonly blocks_promise: Promise<BlockManager>

    constructor() {
        super([WORKER_MESSAGES.init])
        Helpers.setBasePaths('../tesera/www/')
        // Настройка опций
        const {settings} = this
        settings.render_distance_blocks = VIEW_DISTANCE_BLOCKS
        settings.dont_load_mods    = true  // Загрузка модов не работает, нужно настроить директории
        settings.dont_load         = true  // Отключено для ускорения загрузки
        // Начало загрузки блоков
        this.blocks_promise = new BlockManager().init(settings)
    }

    async onMessage(cmd: string, args: any) {
        switch(cmd) {
            case WORKER_MESSAGES.init: {
                this.init_params    = args
                const {username}    = this.init_params
                console.log(`Bot worker ${username} started`)
                const world_enter_params = await this.app.enter(username, PASSWORD)
                const world = await this.Start(world_enter_params, PASSWORD)
                const player = new BotPlayer(this.settings)
                this.player = player
                player.JoinToWorld(world, () => this.Started(player))
                break
            }
        }
    }

    async Start(world_enter_params: IWorldEnterParams, password: string): Promise<BotWorld> {
        const { server_url, world_session_id, world_guid } = world_enter_params

        // Connect to a server
        const connection_string = NetworkHelpers.createConnectioString(NetworkHelpers.clientSwapServerUrl(server_url), {
            world_guid,
            world_session_id,
            skin_obj: null,
            password,
        })
        const ws = new WebSocket(connection_string)
        const websocket_holder = new WebSocketTemporaryHolder(ws)

        this.block_manager  = await this.blocks_promise
        this.world          = new BotWorld(this)

        // Слать пакеты пинга, чтобы вебсокет-прокси не выкинул клиента. Это может быть важно:
        // - пока не войдем в мир
        // - после телепорта, когда ожидаем много данных
        const ping_interval = setInterval(() => {
            if (ws.readyState === WEBSOCKET_READY_STATE.OPEN) {
                ws.send(PROXY_PING_PACKET)
            } else if (ws.readyState >= WEBSOCKET_READY_STATE.CLOSING) {
                clearInterval(ping_interval)
            }
        }, 1000)

        await this.world.connectToServer(websocket_holder)
        return this.world;
    }

    Started(player: BotPlayer): void {
        console.log(`Bot worker ${this.init_params.username}: game started`)
        this.player = player
        player.controlManager.setPos(this.init_params.pos_spawn)
        setInterval(() => this.loop(), PHYSICS_INTERVAL_MS)
    }

    private loop(): void {
        const pn_frame = performance.now()
        const delta = (this.pn_frame ?? pn_frame) - pn_frame
        this.pn_frame = pn_frame
        this.player.update(Math.min(delta, MAX_FPS_DELTA_PROCESSED))
    }

    // Close all connections and timers
    private close(code: int = 1000): void {
        this.ws?.close(code)
        console.log(`Bot worker ${this.init_params.username} closed`)
        process.exit()
    }

    exit(reason?: string, debug = true, show_error?: string, preserve_location = false): void {
        this.close()
    }

}