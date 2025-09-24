import {AbstractWorld} from "@client/abstract_world.js";
import type {TBlock} from "@client/typed_blocks3.js";
import {ServerClient, ServerClientCommand, TAddBuildingSchemasCmd, TCmdSyncTime, TInitClockCmd, TWorldInfoCmd} from "@client/server_client.js";
import {WebSocketTemporaryHolder} from "@client/helpers/websocket.js";
import {BotGame} from "./bot_game.js";
import {BotChunkManager} from "./bot_chunk_manager.js";
import {processPackedWorldConfig, SimpleQueue, Vector} from "@client/helpers.js";
import {ClientLogicClock, LaggingLogicClock, SynchronizedClock, TServerSyncClocksCmd} from "@client/client_logic_clock.js";
import {DEFAULT_ONE_WAY_LATENCY} from "@client/constant.js";
import {ClientWorldPrivateZoneManager} from "@client/world/private_zone/client_zone_manager.js";
import type {World} from "@client/world.js";
import {ChunkGrid} from "@client/grid/chunk_grid.js";
import {LOG_ALIVE_SECONDS} from "./constant.js";

export class BotWorld extends AbstractWorld {
    game:                   BotGame
    latency:                number = DEFAULT_ONE_WAY_LATENCY  // лаг в одну сторону, оцененный клиентом
    serverTimeShift:        number = 0
    server_logic_time       = 0
    server:                 ServerClient
    declare chunkManager:   BotChunkManager
    synchronized_clock:     SynchronizedClock // Оценивает лаг без учета очереди сервера. Реальный лаг игровых действи выше!
    logic_clock:            ClientLogicClock // оценка серверного логического времени по локальным часам
    lagging_clocks          = new Map<int, LaggingLogicClock>() // логические часы для подмножеств серверных объектов с одинаковым ожидаемым лагом
    private lastMeasuredQueudLag = 0
    private unansweredQueudLagTimes = new SimpleQueue<number>()
    private next_log_alive = performance.now() + LOG_ALIVE_SECONDS * 1000

    constructor(game: BotGame) {
        super(game.block_manager)
        this.game = game
        this.chunkManager = new BotChunkManager(this)
    }

    get logic_time(): int { return this.logic_clock.now }
    isBuildingWorld(): boolean { return false }

    getBlock(pos : IVector, result_block: TBlock | null = null, return_multiblock_head: boolean = false): TBlock {
        const resp = this.chunkManager.getBlock(pos, undefined, undefined, result_block)
        if(return_multiblock_head && resp.id > 0 && resp.material.multiblock) {
            return this.getMultiblockHead(resp)
        }
        return resp
    }

    updateSharedClocks(min_diff: float = 200, perf_now: float = performance.now()): void {
        if (!this.game.new_mode_logic_clock) {
            min_diff = 1
            perf_now = performance.now()
        }
        if (perf_now - this.synchronized_clock.perf_now < min_diff) {
            return
        }
        this.synchronized_clock.update(perf_now)
        this.logic_clock.update()
        for(const clock of this.lagging_clocks.values()) {
            clock.update()
        }
    }

    async connectToServer(ws_holder: WebSocketTemporaryHolder): Promise<void> {
        return new Promise<void>(async (resolve) => {
            const server = this.server = new ServerClient()

            const addBuildingSchemas = (cmd_data: TAddBuildingSchemasCmd) => {
            }

            // Add listeners for server commands

            // 1-я часть инициализации (из 2) - инициализация часов, мало данных с малым лагом
            server.AddCmdListener([ServerClientCommand.INIT_CLOCK], ({data} : INetworkMessage<TInitClockCmd>) => {
                this.synchronized_clock = new SynchronizedClock(data.performance_now)
                this.logic_clock = new ClientLogicClock(this.synchronized_clock, data.logic_clock_state)
                this.lagging_clocks.set(0, new LaggingLogicClock(this.logic_clock, false))
            })

            // 2-я часть инициализации (из 2) - остальные данные
            server.AddCmdListener([ServerClientCommand.WORLD_INFO], ({data, time} : INetworkMessage<TWorldInfoCmd>) => {

                processPackedWorldConfig(data.info.generator.config)

                if (!this.synchronized_clock) { // проверить корректность порядка команд
                    throw 'WORLD_INFO: !this.synchronized_clock'
                }

                addBuildingSchemas(data.building_schemas)

                this.setInfo(data, time)

                this.queryTimeSync() // начнем синхронизации часов после завершения трудоемких инициализаций
                resolve()
            });

            this.server.AddCmdListener([ServerClientCommand.WORLD_UPDATE_INFO], (cmd: INetworkMessage<TWorldInfo>) => {
                this.updateInfo(cmd);
            });

            this.server.AddCmdListener([ServerClientCommand.SYNC_TIME], this.onTimeSync.bind(this));

            server.AddCmdListener([ServerClientCommand.TICK], (cmd: INetworkMessage<number>) => {
                this.server_logic_time = Math.max(this.server_logic_time, cmd.data)
                this.updateSharedClocks()
                this.logic_clock.onServerTime(cmd.data)
                this.updateSharedClocks()

                if (performance.now() > this.next_log_alive) {
                    this.next_log_alive = performance.now() + LOG_ALIVE_SECONDS * 1000
                    console.log(`${this.game.init_params.username} still receives packets`)
                }
            })

            this.server.AddCmdListener([ServerClientCommand.QUEUED_PING], this.onQueudPing.bind(this))

            server.AddCmdListener([ServerClientCommand.SYNC_CLOCKS], (cmd: INetworkMessage<TServerSyncClocksCmd>) => {
                this.updateSharedClocks()
                const reply = this.synchronized_clock.reply(cmd.data)
                if (reply) {
                    this.server.Send({ name: ServerClientCommand.SYNC_CLOCKS, data: reply })
                }
                this.updateSharedClocks()
            })

            this.private_zones = new ClientWorldPrivateZoneManager(this as any as World)

            // Connect
            await this.server.connect(ws_holder,() => {}, (event: CloseEvent) => {
                this.game.exit('Connection closed. ' + event.reason, false, event.reason)
            })

        })

    }

    private setInfo(data: TWorldInfoCmd, time: number): void {
        const {info} = data
        this.info   = info
        this.grid   = new ChunkGrid({chunkSize: new Vector().copyFrom(this.info.tech_info.chunk_size)})
        this.chunkManager.init()
    }

    private updateInfo({data: info, time}: INetworkMessage<TWorldInfo>): void {
        this.info = info
    }

    private queryTimeSync() {
        if(!this.server) {
            throw 'error_server_not_inited'
        }
        const data: TCmdSyncTime = {
            clientTime: Date.now(),
            latency: this.latency
        }
        // SERVER MUST answer ASAP, because this is required for time-syncing
        this.server.Send({name: ServerClientCommand.SYNC_TIME, data});

        // Measure the actual game lag in the commands queue
        const now = Math.floor(performance.now())
        this.server.Send({name: ServerClientCommand.QUEUED_PING, data: now})
        this.unansweredQueudLagTimes.push(now)

        const sync_clocks_cmd = this.synchronized_clock.startSynchronization()
        if (sync_clocks_cmd) {
            this.server.Send({ name: ServerClientCommand.SYNC_CLOCKS, data: sync_clocks_cmd })
        }

        setTimeout(() => this.queryTimeSync(), 5000);
    }

    private onTimeSync(cmd : INetworkMessage) {
        const { time, data } = cmd;
        const { clientTime } = data;
        const now     = Date.now();
        const latency = (now - clientTime) / 2;
        const timeLag = (now - time) + latency;
        this.latency         = latency;
        this.serverTimeShift = timeLag;
    }

    private onQueudPing(cmd: INetworkMessage<number>): void {
        const now = performance.now()
        this.lastMeasuredQueudLag = now - cmd.data
        const queue = this.unansweredQueudLagTimes
        while(queue.length && queue.getFirst() <= cmd.data) {
            queue.shift()
        }
    }

}