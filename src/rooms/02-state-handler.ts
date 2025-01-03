// 필요한 모듈 임포트
import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";

// 플레이어 및 상태 정의
export class Player extends Schema {
    @type("number")
    x = Math.floor(Math.random() * 400);

    @type("number")
    y = Math.floor(Math.random() * 400);

    // 목표 위치 추가
    @type("number")
    targetX: number = this.x;

    @type("number")
    targetY: number = this.y;
}

// State 클래스
// 게임의 전체 상태 관리
// players: 현재 방에 있는 모든 플레이어를 MapSchema로 관리
// something: 클라이언트에 전송되지 않는 추가 속성 (예시)
export class State extends Schema {
    @type({ map: Player })
    players = new MapSchema<Player>();

    something = "This attribute won't be sent to the client-side";

    // 메서드
    // createPlayer: 새로운 플레이어를 상태에 추가
    createPlayer(sessionId: string) {
        this.players.set(sessionId, new Player());
    }

    // removePlayer: 플레이어를 상태에서 제거
    removePlayer(sessionId: string) {
        this.players.delete(sessionId);
    }

    // movePlayer: 특정 플레이어의 위치를 이동시킴
    movePlayer (sessionId: string, movement: any) {
        if (movement.x) {
            this.players.get(sessionId).x += movement.x * 10;

        } else if (movement.y) {
            this.players.get(sessionId).y += movement.y * 10;
        }
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
}

// StateHandlerRoom 클래스: Colyseus의 Room을 상속받아 방의 동작을 정의.
// maxClients: 방에 최대 4명의 클라이언트가 접속할 수 있도록 설정.
export class StateHandlerRoom extends Room<State> {
    maxClients = 4;

// 메서드:
    // onCreate: 방이 생성될 때 호출. 초기 상태를 설정하고, "move" 메시지를 처리하는 핸들러를 등록.
    onCreate (options) {
        console.log("StateHandlerRoom created!", options);

        // this.setState(new State()): 새로운 상태 인스턴스를 생성하여 방의 상태로 설정.
        this.setState(new State());

        // onMessage("move", ...): 클라이언트로부터 "move" 메시지를 받으면 해당 플레이어의 위치를 업데이트.
        this.onMessage("move", (client, data) => {
            console.log("StateHandlerRoom received message from", client.sessionId, ":", data);
            this.state.movePlayer(client.sessionId, data);
        });

        // "moveTo" 메시지 처리
        this.onMessage("moveTo", (client, data) => {
            console.log("StateHandlerRoom received moveTo from", client.sessionId, ":", data);
            this.state.setTargetPosition(client.sessionId, data);
        });

        // 주기적으로 플레이어 위치 업데이트 (예: 60 FPS -> 16ms 간격)
        this.setSimulationInterval((deltaTime) => {
            this.state.updatePlayers();
        }, 16); // 16ms는 약 60 FPS에 해당
    }

    // onAuth(client, options, req) {
    //     return true;
    // }

    // onJoin: 클라이언트가 방에 참여할 때 호출. 플레이어를 상태에 추가하고 로그를 출력.
    onJoin (client: Client) {
        // client.send("hello", "world");
        console.log(client.sessionId, "joined!");
        this.state.createPlayer(client.sessionId);
    }

    // onLeave: 클라이언트가 방을 떠날 때 호출. 플레이어를 상태에서 제거하고 로그를 출력.
    onLeave (client) {
        console.log(client.sessionId, "left!");
        this.state.removePlayer(client.sessionId);
    }

    // onDispose: 방이 폐기될 때 호출. 로그를 출력.
    onDispose () {
        console.log("Dispose StateHandlerRoom");
    }

}
