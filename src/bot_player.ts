import {AbstractPlayer, Player, CmdConnectData, PlayerConnectData} from "@client/player.js";
import {GameSettings} from "@client/game_settings.js";
import {Vector} from "@client/helpers.js";
import type {IServerPlayerOrMobOrModel} from "@client/actor_interfaces.js";
import type {AbstractChunk} from "@client/chunk.js";
import {ServerClientCommand} from "@client/server_client.js";
import {Lang} from "@client/lang.js";
import {BotWorld} from "./bot_world.js";
import {GameMode} from "@client/game_mode.js";
import {ClientPlayerEffects} from "@client/player_effects.js";
import {ClientPlayerControlManager} from "@client/control/player_control_manager.js";
import {PlayerControls} from "@client/control/player_control.js";
import {VIEW_DISTANCE_BLOCKS} from "./constant.js";

export class BotPlayer extends AbstractPlayer {
    declare world:              BotWorld
    declare readonly options:   GameSettings
    declare controlManager:     ClientPlayerControlManager
    controls:                   PlayerControls;

    constructor(options: GameSettings) {
        super(options)
        this.is_spectator_bot = true
    }

    /**
     * Вызывается в каждом тике (пока только в режиме обозревателя). Может менять позицию игрока.
     * @param pos
     */
    tick(pos: Vector): void {
        pos.addSelf(this.world.game.init_params.vel)
    }

    get isAlive(): boolean { return true }
    isWorldAdmin(): boolean { return true }
    getEyePos(): Vector { throw new Error('not_implemented') }
    getRaycasterExceptPlayersMobs(): IServerPlayerOrMobOrModel[] { return [] }
    getBlockPos(out?: Vector): Vector { throw new Error('not_implemented') }
    getOverChunk(): AbstractChunk | null { throw new Error('not_implemented') }
    getBiomeId(): int | null | undefined { return null }
    get rotate(): Vector { return this.state.rotate }

    JoinToWorld(world: BotWorld, cb: Function): void {
        this.world = world;
        //
        this.world.server.AddCmdListener([ServerClientCommand.CONNECTED], (cmd: INetworkMessage<PlayerConnectData>) => {
            this.playerConnectedToWorld(cmd.data)
            cb()
        })
        const data: CmdConnectData = {
            world_guid:             world.info.guid,
            render_distance_blocks: VIEW_DISTANCE_BLOCKS,
            is_spectator_bot:       true,
            spectator_bot_pos:      this.world.game.init_params.pos_spawn,
            lang_code:              Lang.code,
            shared_options:         this.options.exportShared(),
        }
        this.world.server.Send({name: ServerClientCommand.CONNECT, data})
    }

    private playerConnectedToWorld(data: PlayerConnectData): void {
        const player = this as any as Player
        this.session                = data.session;
        this.state                  = data.state;
        this.state.pos              = new Vector().copyFrom(this.state.pos)
        this.state.rotate           = new Vector().copyFrom(this.state.rotate)
        this.status                 = data.status;
        this.skin                   = data.skin;
        this.world_data             = { shared_world_data: data.shared_world_data }
        // Game mode
        this.game_mode              = new GameMode(this, data.state.game_mode);
        this.effects = new ClientPlayerEffects(this, data.full_state_update.effects)
        this.physics_state.effects = this.effects
        this.physics_state.copyFromPlayer(this)
        this.physics_state.importPOJO(data.physics_state)
        this.updateHeight()
        this.controlManager         = new ClientPlayerControlManager(player, data.control_init_info)
        this.controls               = new PlayerControls(player);

        // Полет в указанном направлении с указанной скоростью
        this.controlManager.spectator.on_tick = this.tick.bind(this)
    }

    update(delta): void {
        this.controlManager.update()
    }

}