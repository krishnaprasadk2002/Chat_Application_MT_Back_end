import { Server, Socket } from "socket.io";
import http from "http";
import { parse } from "cookie";
import IJWTService, { IPayload } from '../Utils/IJWTservices'
// constants
import { ChatEnum } from "../../constants/socketEvents";
import { HttpStatusCode } from "../../Enum/httpStatusCode";
import jwtService from "../Configs/JWTservices";
import { isObjectIdOrHexString } from "mongoose";

class CustomError extends Error {
    constructor(public statusCode: number, message: string) {
        super(message);
        this.name = "CustomError";
    }
}

interface IAuthSocket extends Socket {
    userId?: string;
}

export function ConnectSocket(httpServer: http.Server) {
    const activeChat: Map<string, Set<string>> = new Map();

    const io = new Server(httpServer, {
        pingTimeout: 60000,
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:4200',
            methods: ["GET", 'POST'],
            credentials: true
        }
    });

    io.use((socket: IAuthSocket, next) => {
        try {
            const rawCookie = socket.handshake.headers.cookie;
            
            if (!rawCookie) {
                console.error('No cookies found');
                return next(new CustomError(HttpStatusCode.UNAUTHORIZED, 'No cookies found'));
            }
            const { accessToken } = parse(rawCookie);

            console.log( parse(rawCookie));
            
            
            if (!accessToken) {
                throw new CustomError(HttpStatusCode.UNAUTHORIZED, 'User is not authenticated: No token found.');
            }
    
            // Verify the token
            console.log(accessToken,"here is");
            
            const decoded: IPayload = jwtService.verifyToken(accessToken);
            console.log("b");
            console.log(decoded, "hy");
            
            if (!decoded || !isObjectIdOrHexString(decoded.userId)) {
                console.error('Decoded token is invalid or ID is not a valid ObjectId');
                throw new CustomError(HttpStatusCode.UNAUTHORIZED, 'User is not authenticated: Invalid token ID.');
            }
            
    
            socket.userId = decoded.userId;
            next();
        } catch (error: any) {
            console.error('Socket authentication error:', error); 
            next(error);
        }
    });
    
    io.on(ChatEnum.CONNECTION,async (socket:IAuthSocket)=>{
        console.log("socket connected");
        
        socket.on('error', (err) => {
            console.error('Socket error:', err);
        });
        socket.join(socket.userId!)

        joinAndLeaveChat(socket,activeChat)

        socket.on(ChatEnum.DISCONNECT_EVENT, async () => {
            console.log('socket Disconnected');
            
        });
    })

    return {
        emitSocketEvent:function<T>(roomId:string,event:string,payload:T){
            io.in(roomId).emit(event,payload)
        },
        isReciverInChat(chatId: string, reciverId: string) {
            const userJoined:Set<string>| undefined = activeChat.get(chatId);

            if(!userJoined)return false

            return userJoined.has(reciverId);
        }
    }

}

const joinAndLeaveChat = (socket: IAuthSocket, activeChat: Map<string, Set<string>>) => {
    socket.on(ChatEnum.JOIN_CHAT_EVENT, (chatId: string) => {
        socket.join(chatId);

        if (socket.userId) {  
            if (activeChat.has(chatId)) {
                activeChat.get(chatId)?.add(socket.userId);
            } else {
                activeChat.set(chatId, new Set<string>([socket.userId]));
            }
        }
    });

    socket.on(ChatEnum.LEAVE_CHAT_EVENT, (chatId: string) => {
        socket.leave(chatId);
        
        const userSet = activeChat.get(chatId);
        if (userSet) {
            userSet.delete(socket.userId!);
            if (userSet.size === 0) {
                activeChat.delete(chatId);
            }
        }        
    });
    
};
