import {Connectors} from 'shoukaku';
export class ManagedAudioConnector extends Connectors.DiscordJS{
 listen(nodes){
  this.onRaw=packet=>this.raw(packet);
  this.onReady=()=>this.ready(nodes);
  this.client.on('raw',this.onRaw);
  if(!this.client.isReady())this.client.once('clientReady',this.onReady);
 }
 start(nodes){if(this.client.isReady() && !this.manager.nodes.size)this.ready(nodes);}
 dispose(){this.client.off('raw',this.onRaw);this.client.off('clientReady',this.onReady);}
}
export function disposeAudioManager(manager){
 manager.connector.dispose();
 // Do not use removeNode here: Shoukaku reconnects from its websocket close
 // listener. Detach the old transport before closing to retire it permanently.
 manager.options.reconnectTries=0;
 for(const node of manager.nodes.values()){node.once('ready',()=>node.cleanupWebsocket());node.cleanupWebsocket();}
 manager.nodes.clear();
}
