import { Worker } from "worker_threads";
import {Vector} from "@client/math/vector.js";
import {WorkerInitParams} from "./types.js";
import {BOTS_COUNT, WORLD_GUID} from "./constant.js";

class WorkerExt extends Worker {
    params: WorkerInitParams
}

class Test {

    private test_players: WorkerExt[]

    start(world_guid: string, test_players_count: int) {
        this.test_players = [];
        for(let i = 0; i < test_players_count; i++) {
            const worker = new WorkerExt('./src/worker.js', {type: 'module'} as any);
            worker.params = {
                world_guid:     world_guid,
                username:       `Bot${i}`,
                pos_spawn:      new Vector(i * 1000, 75, 0),
                vel:            new Vector(0, 0, 0.25), // Блоков/тик
            };
            worker.on('exit', () => {
                console.log(`Worker closed ${worker.params.username}!`);
            });
            worker.postMessage(['init', worker.params])
            this.test_players.push(worker);
        }
    }

}

const test = new Test();
test.start(WORLD_GUID, BOTS_COUNT)