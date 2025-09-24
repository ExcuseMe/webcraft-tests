import {AbstractChunkManager} from "@client/chunk_manager.js";
import {TBlock} from "@client/typed_blocks3.js";
import {AbstractChunk} from "@client/chunk.js";
import {LIGHT_WORKER_MESSAGE} from "@client/constant.js";
import {AbstractWorld} from "@client/abstract_world.js";
import {VectorCollector} from "@client/helpers/vector_collector.js";
import {TCmdBlockSet} from "@client/server_client.js";

export class BotChunkManager extends AbstractChunkManager {

    chunk_modifiers = new VectorCollector<TCmdBlockSet[]>()
    tech_info: TWorldTechInfo

    constructor(world: AbstractWorld) {
        super(world)
    }

    init(): void {
        const {world}   = this
        this.tech_info  = world.info.tech_info
        this.grid       = world.grid
    }

    getBlock(x: int | IVector, y?: int | null, z?: int | null, result?: TBlock): TBlock {
        return this.DUMMY
    }

    getByPos(pos: IVector): AbstractChunk | null {
        return null
    }

    getChunk(addr: IVector): AbstractChunk | null {
        return null
    }

    postLightWorkerMessage(cmd: LIGHT_WORKER_MESSAGE, args: any): void {
        throw new Error('not_implemented')
    }

}