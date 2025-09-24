
export enum WORKER_MESSAGES {
    init = 'init',
}

export type WorkerInitParams = {
    world_guid: string
    username:   string
    pos_spawn:  IVector // Начальная позиция
    vel:        IVector // Скорость и направление полета. В блоках/тик.
}