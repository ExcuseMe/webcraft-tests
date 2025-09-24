# webcraft-tests
Creates multiple spectator bots.

How to launch:

1. Set in `data/master_config.json`
```
"google_recaptcha": {
  "enabled": false,
}
```

2. Set in `WorldConfig.gamemode.spectator_bots_enabled = true` (at the time of writing, it's already true).

3. Configure bots (if necessary):
- edit `src/constant.ts`
- edit bot spawning code in `Test.start` in `src/index.ts`
- edit bot movement code in `BotPlayer.start` in `src/bot_player.ts`

4. Run
```
cd webcraft-tests
npm i
npm run build
npm run start
```