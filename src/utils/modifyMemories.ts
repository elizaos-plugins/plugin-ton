import {
    composeContext,
    ModelClass,
    type IAgentRuntime,
    type Memory,
    type State,

    generateText,
} from "@elizaos/core";

export async function replaceLastMemory(
    runtime: IAgentRuntime, 
    state: State, 
    template:string
) : Promise<Memory> {

    const memory = state.recentMessagesData[0]

    await runtime.messageManager.removeMemory(memory.id);
    
    const responseContext = composeContext({
        state,
        template
    });

    const response = await generateText({
        runtime: runtime,
        context: responseContext,
        modelClass: ModelClass.SMALL,
    });


    const newMemory = await runtime.messageManager.addEmbeddingToMemory({
        userId: memory.userId,
        agentId: memory.agentId,
        roomId: memory.roomId,
        content: {
            ...memory.content,
            text: response,
        },
    });

    await runtime.messageManager.createMemory(newMemory);

    return newMemory;
}

export async function addMemory(
    runtime: IAgentRuntime, 
    state: State, 
    memory: Memory, 
    template:string
) : Promise<Memory> {

    const responseContext = composeContext({
        state,
        template
    });

    const response = await generateText({
        runtime: runtime,
        context: responseContext,
        modelClass: ModelClass.SMALL,
    });

    const newMemory = await runtime.messageManager.addEmbeddingToMemory( {
        userId: memory.userId,
        agentId: memory.agentId,
        roomId: memory.roomId,
        content: {
            text: response,
            inReplyTo: memory.content.inReplyTo,
            action: memory.content.action,
            source: memory.content.source,
        },
    });

    await runtime.messageManager.createMemory(newMemory);

    return newMemory;
}