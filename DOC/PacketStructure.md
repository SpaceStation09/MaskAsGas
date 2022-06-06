# Data Distribution in Packet

## Packed1

| Offset | Field              | Block Size | Note   |
| ------ | ------------------ | ---------- | ------ |
| 0      |                    | 128        | unused |
| 128    | total token amount | 96         |        |
| 224    | expire time        | 32         |        |

## Packed2

| Offset | Field                 | Block Size | Note   |
| ------ | --------------------- | ---------- | ------ |
| 0      |                       | 64         | unused |
| 64     | token address         | 160        |        |
| 224    | claimed packet number | 15         |        |
| 239    | total packet amount   | 15         |        |
| 254    | token type            | 1          |        |
| 255    | if random             | 1          |        |
