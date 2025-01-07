// 필요한 모듈 임포트
import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import axios from 'axios';

// 게임 상태 정의
enum GameState {
    WAITING = "WAITING",
    COUNTDOWN = "COUNTDOWN",
    PLAYING = "PLAYING"
}

// 플레이어 및 상태 정의
export class Player extends Schema {
    @type("string")
    nickname: string = "익명"; // 기본 닉네임

    @type("number")
    x: number = 1000;

    @type("number")
    y: number = 430;

    // 목표 위치 추가
    @type("number")
    targetX: number = this.x;

    @type("number")
    targetY: number = this.y;

    // 식칼 정보
    @type("number")
    knifeX: number = this.x;

    @type("number")
    knifeY: number = this.y;

    @type("boolean")
    knifeActive: boolean = false;

     // 기본 HP 100
    @type("number")
    hp: number = 613;

    @type("number")
     // 마법 저항력
    magicResistance: number = 29;

    // 1초당 체력 재생
    @type("number")
    regenRate: number = 7;

    // 스킬로 소모한 체력
    skillCost: number = 50;

    // 실제로 소모된 체력을 저장 (적중 시 회복 용도)
    actualSkillCost: number = 0;

    // Q 스킬 사용 메서드
    useQSkill(): void {
        const prevHp = this.hp;
        if (this.hp > this.skillCost) {
            this.hp -= this.skillCost;
        } else {
            this.hp = 1;
        }
        this.actualSkillCost = prevHp - this.hp; // 실제 소모된 체력을 저장
    }

    // 데미지 계산 메서드
    calculateDamage(target: Player): number {
        const currentHealthPercentDamage = target.hp * 0.2; // 체력의 20%
        const minimumDamage = 80; // 최소 데미지
        const rawDamage = Math.max(currentHealthPercentDamage, minimumDamage); // 더 큰 값 선택

        // 마법 저항력 계산
        const effectiveDamage = rawDamage * (100 / (100 + target.magicResistance));
        console.log(effectiveDamage);
        return Math.round(effectiveDamage); // 정수로 반올림
    }

    // 체력 재생 메서드 (1초마다 호출)
    regenerateHealth(deltaTime: number) {
        this.hp += (this.regenRate * deltaTime) / 1000;
        //console.log(this.hp);
        this.hp = Math.min(this.hp, 613); // 최대 체력 제한
    }

    // 적중 시 체력 회복
    recoverHealth() {
        this.hp = Math.min(this.hp + this.actualSkillCost, 613); // 실제 소모된 체력만큼 회복
        this.actualSkillCost = 0; // 회복 후 초기화
    }

    // 승리(1), 패배(2)
    @type("number")
    victoryNum: number = 0;

    //각자 준비상태 확인(다시 시작에 사용)
    @type("boolean")
    ready: boolean = false;

    // 점멸 여부 판단용
    @type("boolean")
    teleport: boolean = false;
}

// State 클래스
// 게임의 전체 상태 관리
// players: 현재 방에 있는 모든 플레이어를 MapSchema로 관리
// something: 클라이언트에 전송되지 않는 추가 속성 (예시)
export class State extends Schema {
    @type({ map: Player })
    players = new MapSchema<Player>();

    // 게임 상태
    @type("string")
    gameState: GameState = GameState.WAITING; // 초기엔 WAITING
    @type("boolean")
    gameOver: boolean = false;
    @type("number")
    selectButton: number = 0;

    something = "This attribute won't be sent to the client-side";


    // (1) onGameOverCallback 타입 정의 (콜백 함수):
    //     winnerNickname, loserNickname, 전체 players를 넘겨줌
    private onGameOverCallback: (
        winnerNickname: string,
        loserNickname: string,
        allPlayers: MapSchema<Player>
    ) => void;

    constructor(
        onGameOverCallback: (
            winnerNickname: string,
            loserNickname: string,
            allPlayers: MapSchema<Player>
        ) => void
    ) {
        super();
        this.onGameOverCallback = onGameOverCallback;
    }

    regeneratePlayersHealth(deltaTime: number) {
        this.players.forEach(player => {
            player.regenerateHealth(deltaTime);
        });
    }

    // 메서드
    // createPlayer: 새로운 플레이어를 상태에 추가
    createPlayer(sessionId: string) {
        this.players.set(sessionId, new Player());
    }

    // removePlayer: 플레이어를 상태에서 제거
    removePlayer(sessionId: string) {
        this.players.delete(sessionId);
    }

    // 목표 위치 설정
    setTargetPosition(sessionId: string, target: { x: number, y: number }) {
        const player = this.players.get(sessionId);
        if (player) {
            player.targetX = target.x;
            player.targetY = target.y;
        }
    }

    // 플레이어의 위치를 목표 위치로 이동시키는 메서드
    updatePlayers() {
        // 게임 상태가 PLAYING 상태일 때만 실제 이동
        if (this.gameState !== GameState.PLAYING) return;

        const speed = 5; // 플레이어의 이동 속도 (픽셀 단위)
        this.players.forEach(player => {
            const dx = player.targetX - player.x;
            const dy = player.targetY - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > speed) {
                // 정규화된 벡터 계산
                const unitX = dx / distance;
                const unitY = dy / distance;

                // 이동 속도에 따라 위치 업데이트
                player.x += unitX * speed;
                player.y += unitY * speed;
            } else if (distance > 0) {
                // 목표 위치에 거의 도달했을 때 정확하게 설정
                player.x = player.targetX;
                player.y = player.targetY;
            }
        });
    }

    // 식칼 날리기
    setKnifeThrow(sessionId: string, knifeData: { targetX: number, targetY: number }) {
        // 게임 상태가 PLAYING이 아닐 땐 무시
        if (this.gameState !== GameState.PLAYING) return;

        const player = this.players.get(sessionId);
        if (!player) return;

        // Q 스킬 사용 로직 호출 (체력 감소)
        player.useQSkill();

        const dx = knifeData.targetX - player.x;
        const dy = knifeData.targetY - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) return; // Avoid division by zero

        const unitX = dx / distance;
        const unitY = dy / distance;

        player.knifeX = player.x;
        player.knifeY = player.y;
        player.knifeActive = true;

        const maxDistance = 500;
        const speed = 10;
        let traveledDistance = 0;

        const interval = setInterval(() => {
            if (!player.knifeActive || traveledDistance >= maxDistance) {
                player.knifeActive = false;
                clearInterval(interval);
                return;
            }

            player.knifeX += unitX * speed;
            player.knifeY += unitY * speed;
            traveledDistance += speed;

            // 충돌 판정
            this.players.forEach((otherPlayer, otherSessionId) => {
                if (otherSessionId !== sessionId && otherPlayer.hp > 0) {
                    // 캐릭터의 경계 박스 계산
                    const playerHalfWidth = 50; // 캐릭터 크기 100px의 절반
                    const playerHalfHeight = 50;
            
                    const playerLeft = otherPlayer.x - playerHalfWidth;
                    const playerRight = otherPlayer.x + playerHalfWidth;
                    const playerTop = otherPlayer.y - playerHalfHeight;
                    const playerBottom = otherPlayer.y + playerHalfHeight;
            
                    // 칼의 경계 박스 계산
                    // 칼 크기 30px의 절반이 테두리긴 한데 조금 더 들어와야 될듯
                    const knifeHalfWidth = 5; 
                    const knifeHalfHeight = 5;
            
                    const knifeLeft = player.knifeX - knifeHalfWidth;
                    const knifeRight = player.knifeX + knifeHalfWidth;
                    const knifeTop = player.knifeY - knifeHalfHeight;
                    const knifeBottom = player.knifeY + knifeHalfHeight;
            
                    // AABB 충돌 판정
                    const isCollision = 
                        playerRight > knifeLeft &&
                        playerLeft < knifeRight &&
                        playerBottom > knifeTop &&
                        playerTop < knifeBottom;
            
                    if (isCollision) {
                        const damage = player.calculateDamage(otherPlayer);
                        otherPlayer.hp -= damage; // HP 감소
                        console.log(`Player ${otherSessionId} hit! HP: ${otherPlayer.hp}`);

                        // 소모된 체력 회복
                        player.recoverHealth();
                        console.log(`Player ${sessionId} recovered ${player.actualSkillCost} health. Current HP: ${player.hp}`);

                        player.knifeActive = false;
                        clearInterval(interval); // 칼의 이동 중단

                        // 만약 otherPlayer의 hp가 0 이하가 되었다면 => 게임 오버 처리
                        if (otherPlayer.hp <= 0) {
                            this.gameOver = true;

                            // 승자 / 패자 닉네임
                            const winnerNickname = player.nickname;
                            const loserNickname = otherPlayer.nickname;

                            // 여기서 콜백 호출!
                            this.onGameOverCallback(
                                winnerNickname,
                                loserNickname,
                                this.players
                            );
                        }
                    }
                }
            });
        }, 16);
    }    

    // 게임 끝났을 때 승리, 패배 화면 보여주기
    showFinishScene(sessionId: string) {
        // console.log("??????????????");
        const player = this.players.get(sessionId);
        if(!player) return;

        let someoneDefeated = false;
        let everyoneElseDefeated = true;

        this.players.forEach((otherPlayer, otherSessionId) => {
            if (otherSessionId !== sessionId && otherPlayer.hp <= 0) {
                everyoneElseDefeated = false;
            }
            if (otherSessionId !== sessionId && otherPlayer.hp <= 0) {
                someoneDefeated = true;
            }
        });

        if (player.hp > 0 && someoneDefeated) {
            player.victoryNum = 1; // Player wins
            console.log(player.victoryNum);
            this.gameOver = true;
            return;
        } else if (player.hp <= 0) {
            player.victoryNum = 2; // Player loses
            console.log(player.victoryNum);
            this.gameOver = true;
            return;
        }
    }
}

// StateHandlerRoom 클래스: Colyseus의 Room을 상속받아 방의 동작을 정의.
// maxClients: 방에 최대 4명의 클라이언트가 접속할 수 있도록 설정.
export class StateHandlerRoom extends Room<State> {
    maxClients = 2;
    autoDispose = false;

    private disposeTimeout: NodeJS.Timeout | null = null;
    private disposeDelay: number = 500; // 밀리초

    // 메서드:
    // onCreate: 방이 생성될 때 호출. 초기 상태를 설정하고, "move" 메시지를 처리하는 핸들러를 등록.
    onCreate (options) {
        console.log("StateHandlerRoom created!", options);

        // this.setState(new State()): 새로운 상태 인스턴스를 생성하여 방의 상태로 설정.
        // this.setState(new State());
        const centerX = 1025; // Center x of the circle
        const centerY = 450; // Center y of the circle
        const radius = 260; // Radius of the circle
        // (1) State 인스턴스 생성 시, "onGameOverCallback" 콜백을 넘겨준다.
        //     => 누가 승리했는지 알게 되면 이 콜백을 호출하도록 State를 설정
        const newState = new State((winnerNickname, loserNickname, allPlayers) => {
            // 이 콜백은 State에서 hp <= 0 판정이 났을 때 불린다.
            // ⇒ 여기서 axios POST를 날리면 됨
            this.sendBattleRecord(winnerNickname, loserNickname, allPlayers);
        });
        
        this.setState(newState);

        // 우클릭 움직임 메시지 처리
        this.onMessage("moveTo", (client, data) => {
            console.log("StateHandlerRoom received moveTo from", client.sessionId, ":", data);
            // this.state.setTargetPosition(client.sessionId, data);
            // if(this.state.gameOver) return;
            // Calculate the distance from the center of the circle
            const dx = data.x - centerX;
            const dy = data.y - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // If the player is outside the circle, calculate the position on the circle's edge
            if (distance > radius) {
                const angle = Math.atan2(dy, dx); // Calculate the angle of the player from the center
                const newX = centerX + radius * Math.cos(angle); // Calculate the x coordinate on the circle
                const newY = centerY + radius * Math.sin(angle); // Calculate the y coordinate on the circle

                // Update the player’s position to be on the circle's edge
                this.state.setTargetPosition(client.sessionId, { x: newX, y: newY });
            } else {
                // If the player is inside the circle, update normally
                this.state.setTargetPosition(client.sessionId, data);
            }
        });

        // 식칼 던지기 메시지 처리
        this.onMessage("throwKnife", (client, data) => {
            console.log(`Received throwKnife from ${client.sessionId}`);
            this.state.setKnifeThrow(client.sessionId, data);
            // if(this.state.gameOver) return;
        });         

        // 주기적으로 플레이어 위치 업데이트 (예: 60 FPS -> 16ms 간격)
        this.setSimulationInterval((deltaTime) => {
            this.state.updatePlayers();
            this.state.regeneratePlayersHealth(deltaTime);
        }, 16); // 16ms는 약 60 FPS에 해당

        // 게임 종료
        this.onMessage("finishScene", (client) => {
            // console.log("Finish game", client.sessionId);
            this.state.showFinishScene(client.sessionId);
        })

        //게임 다시 시작하기
        this.onMessage("restartGame", (client) => {
            console.log("Restart game");
            const player = this.state.players.get(client.sessionId);
            this.state.players.forEach((player) =>{
                player.hp = 613;
                player.victoryNum = 0;
            });
            // this.state.gameState = GameState.WAITING;
            // this.state.selectButton = 0;
            this.state.gameOver = false;
        })

        //상대방이 버튼 클릭했는지 확인하는 로직(수정해야함)
        // 내가 먼저 누르면 업데이트 안됨, 내가 2번 눌러도 넘어감감
        this.onMessage("buttonClicked", (client) =>{
            console.log("Select button");
            this.state.selectButton += 1;
        })


        // Chatting
        this.onMessage("chat", (client, text: string) => {
            // 현재 플레이어 정보
            const player = this.state.players.get(client.sessionId);
            const nickname = player ? player.nickname : "익명";

            // 모든 클라이언트에게 broadcast
            this.broadcast("chat", {
                sessionId: client.sessionId,
                nickname: nickname,
                text: text,
            });
        });

        // F 키 점멸 (flash) 메시지 처리
        this.onMessage("flash", (client, data: { targetX: number, targetY: number }) => {
            this.handleFlash(client, data);
        });
    }

    // onAuth(client, options, req) {
    //     return true;
    // }

    // onJoin: 클라이언트가 방에 참여할 때 호출. 플레이어를 상태에 추가하고 로그를 출력.
    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined with nickname:", options.nickname || "익명");
        const player = new Player();
        player.nickname = options.nickname || "익명"; // 닉네임 설정
        this.state.players.set(client.sessionId, player);

        // 대기 중인 사람 수 확인
        console.log("Current player count:", this.clients.length);

        const count = this.clients.length; // 현재 방 인원
        // 모든 클라이언트에게 playerCount 메시지 전송
        this.broadcast("playerCount", { count });

        if(this.clients.length === this.maxClients && this.state.selectButton === 1){
            this.state.gameState = GameState.WAITING;
            this.broadcast("gameState", { state: "WAITING" });
        }
        // 만약 maxClients == 현재 접속 클라이언트 수 == 2라면 -> 카운트다운 시작
        else if (this.clients.length === this.maxClients && this.state.gameState === "WAITING" && (this.state.selectButton === 0 || this.state.selectButton === 2)) {
            console.log("저기 들어가게 해")
            this.state.selectButton = 0;
            this.state.gameState = GameState.COUNTDOWN;

            // 모든 클라이언트에게 COUNTDOWN 상태 전송
            this.broadcast("gameState", { state: "COUNTDOWN" });

            // 3초 후에 PLAYING 시작
            setTimeout(() => {
                // 혹시나 중간에 누군가 나갔는지 체크
                if (this.clients.length === this.maxClients) {
                    this.state.gameState = GameState.PLAYING;
                    this.broadcast("gameState", { state: "PLAYING" });
                } else {
                    // 다시 WAITING으로 돌려놓든, 취소 처리
                    this.state.gameState = GameState.WAITING;
                    this.broadcast("gameState", { state: "WAITING" });
                }
            }, 3000);
        }

        // 새 클라이언트가 참여하면 폐기 타이머를 취소
        if (this.disposeTimeout) {
            console.log("New client joined. Canceling dispose timeout...");
            clearTimeout(this.disposeTimeout);
            this.disposeTimeout = null;
        }
    }

    // onLeave: 클라이언트가 방을 떠날 때 호출. 플레이어를 상태에서 제거하고 로그를 출력.
    onLeave (client) {
        console.log(client.sessionId, "left!");
        this.state.removePlayer(client.sessionId);

        const count = this.clients.length;
        this.broadcast("playerCount", { count });

        if (this.clients.length === 0) {
            console.log("No clients left. Starting dispose timeout...");
    
            // n초 후 방을 폐기하는 타이머 설정
            this.disposeTimeout = setTimeout(() => {
                console.log("Room is empty for 10 seconds. Disposing room...");
                this.disconnect(); // 방 폐기
            }, this.disposeDelay);
        }
    }

    // onDispose: 방이 폐기될 때 호출. 로그를 출력.
    onDispose () {
        // await this.checkServer();
        console.log("Dispose StateHandlerRoom");
    }

    /**
     * f 키 점멸 (순간이동) 처리
     */
    private handleFlash(client: Client, data: { targetX: number; targetY: number }) {
        if (this.state.gameState !== GameState.PLAYING) return;

        const player = this.state.players.get(client.sessionId);
        if (!player) return;

        // 최대 사거리 설정
        const FLASH_RANGE = 300;

        const startX = player.x;
        const startY = player.y;

        const dx = data.targetX - startX;
        const dy = data.targetY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 사거리 초과 시 보정
        let finalX = data.targetX;
        let finalY = data.targetY;
        if (dist > FLASH_RANGE) {
            const ratio = FLASH_RANGE / dist;
            finalX = startX + dx * ratio;
            finalY = startY + dy * ratio;
        }

        // 실제 좌표 갱신
        player.x = finalX;
        player.y = finalY;
        // targetX, targetY도 순간이동된 상태로 맞춰줌
        player.targetX = finalX;
        player.targetY = finalY;

        // "이번 이동은 순간이동이다" 라는 플래그
        player.teleport = true;

        // 모든 클라이언트에게 이펙트/사운드 안내
        this.broadcast("flashEffect", {
            sessionId: client.sessionId,
            fromX: startX,
            fromY: startY,
            toX: finalX,
            toY: finalY
        });
    }


    // 실제로 battleRecords로 POST를 날리는 메서드
    private sendBattleRecord(
        winnerNickname: string, 
        loserNickname: string, 
        allPlayers: Map<string, any> // 혹은 Player 타입의 Map
    ) {
        // 예: 두 플레이어라고 가정
        const playersArray = Array.from(allPlayers.values());
        if (playersArray.length < 2) {
            console.log("Not enough players to send record.");
            return;
        }

        // player1, player2 결정
        // (방 안에 두 명만 있다고 가정)
        const p1Nickname = playersArray[0].nickname;
        const p2Nickname = playersArray[1].nickname;

        const data = {
            player1: p1Nickname,
            player2: p2Nickname,
            winner: winnerNickname
        };

        console.log("Sending battle record => ", data);

        axios.post("http://localhost:3000/battleRecords", data)
            .then(res => {
                console.log("[BattleRecord] status:", res.status);
                console.log("[BattleRecord] data:", res.data);
            })
            .catch(err => {
                if (err.response) {
                    console.error("[BattleRecord] error status:", err.response.status);
                    console.error("[BattleRecord] error data:", err.response.data);
                } else {
                    console.error("[BattleRecord] error:", err.message);
                }
            });
        }

    // 예시
    // private async checkServer() {
    //     const uri = "http://localhost:3000/checking";
        
    //     try {
    //         // POST 요청 (데이터 없이)
    //         const response = await axios.post(uri);
            
    //         // 응답 출력
    //         console.log("Response status:", response.status); // HTTP 상태 코드
    //         console.log("Response data:", response.data); // 응답 본문
    //     } catch (error) {
    //         // 에러 처리
    //         if (error.response) {
    //             console.error("Error response status:", error.response.status);
    //             console.error("Error response data:", error.response.data);
    //         } else {
    //             console.error("Error sending POST request:", error.message);
    //         }
    //     }
    // }
}