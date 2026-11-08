/**
 * ═══════════════════════════════════════════════════════════════
 *  IPTVOS — script.js  v4.0
 *  + Tela Home com 3 cards (Live / Filmes / Séries)
 *  + Filmes: grid com poster, tela de detalhes, player VOD
 *  + Séries: temporadas, episódios, player com seek
 *  + Barra de progresso / seek no player VOD
 *  + Xtream Codes API
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   1. TECLAS
   ───────────────────────────────────────────────────────────── */
const KEYS = {
  LEFT:37, UP:38, RIGHT:39, DOWN:40,
  OK:13, BACK:461, HOME:36, ESC:27, EXIT:1001,
  RED:403, GREEN:404, YELLOW:405, BLUE:406,
  PLAY:415, PAUSE:19, STOP:413,
  CH_UP:33, CH_DN:34,
};

const SCREENS = {
  SETUP: 'SETUP',
  HOME: 'HOME',
  LIVE_LIST: 'LIVE_LIST',
  VOD_LIST: 'VOD_LIST',
  SERIES_LIST: 'SERIES_LIST',
  DETAIL: 'DETAIL',
  PLAYER: 'PLAYER',
};

var currentScreen = SCREENS.SETUP;

/* ─────────────────────────────────────────────────────────────
   2. ESTADO GLOBAL
   ───────────────────────────────────────────────────────────── */
const App = {
  /* credenciais */
  xtHost: '', xtUser: '', xtPass: '',

  /* live */
  allChannels: [], liveCategories: [], filteredChannels: [],
  currentCategory: 'Todos', catFocusIndex: 0,
  gridFocusIndex: 0, focusZone: 'grid',

  /* vod */
  vodMode: 'movies',          // 'movies' | 'series'
  allVod: [],                 // lista de filmes ou séries
  vodCategories: [],
  filteredVod: [],
  vodCatFocusIndex: 0,
  vodGridFocusIndex: 0,
  vodFocusZone: 'grid',
  vodCurrentCategory: 'Todos',

  /* detalhe */
  currentDetail: null,        // item sendo visualizado
  currentSeason: null,        // número da temporada selecionada
  seasonEpisodes: {},         // { seasonNum: [episodes] }
  detailFocus: 'play',        // 'play' | 'back' | 'seasonN' | 'epN'

  /* favoritos */
  favorites: {channels:{}, movies:{}, series:{}},
  continueWatching: {},
  homeContinueItems: [],
  homeFocusType: 'card',

  /* player */
  currentScreen: 'setup',
  currentChannelIndex: 0,
  currentVodItem: null,
  hlsInstance: null,
  overlayTimer: null,
  overlayVisible: false,
  playerMode: 'live',         // 'live' | 'vod'
  videoReturnScreen: 'vod',
  navStack: [],
  nextEpisodeTarget: null,
  nextEpisodePromptShown: false,
  lastProgressSaveAt: 0,

  /* paginação live */
  PAGE_SIZE: 60, currentPage: 0, totalPages: 0,
  GRID_COLS: 6,

  /* paginação vod */
  vodPageSize: 40, vodCurrentPage: 0, vodTotalPages: 0,
  VOD_COLS: 5,

  loginFocus: 'xt-host',
  homeFocus: 0,

  OVERLAY_TIMEOUT: 5000,
  CORS_PROXY: 'https://api.allorigins.win/raw?url=',
};

function screenToPublicState(name){
  if(name==='home') return SCREENS.HOME;
  if(name==='player') return SCREENS.LIVE_LIST;
  if(name==='vod') return App.vodMode==='series' ? SCREENS.SERIES_LIST : SCREENS.VOD_LIST;
  if(name==='video') return SCREENS.PLAYER;
  if(name==='detail') return SCREENS.DETAIL;
  return SCREENS.SETUP;
}

function getSubtitleUrl(item){
  if(!item) return '';
  const src=item.subtitle||item.subtitleUrl||item.subtitles_url||item.subtitles||item.external_subtitles||item.externalSubtitles;
  if(Array.isArray(src)){
    const first=src.find(s=>typeof s==='string'||(s&&(s.url||s.file)));
    return typeof first==='string' ? first : ((first&&first.url)||(first&&first.file)||'');
  }
  if(src&&typeof src==='object') return src.url||src.file||'';
  return typeof src==='string' ? src : '';
}

function forceFocus(containerId){
  const container=document.getElementById(containerId);
  if(!container||container.classList.contains('hidden')) return null;
  const first=container.querySelector('.focusable:not([disabled])');
  if(!first) return null;
  if(!first.hasAttribute('tabindex')) first.setAttribute('tabindex','0');
  first.focus({preventScroll:true});
  return first;
}

function loadExternalSubs(url){
  return Player.loadExternalSubs(url);
}

/* ─────────────────────────────────────────────────────────────
   3. STORAGE
   ───────────────────────────────────────────────────────────── */
const Storage = {
  K: { HOST:'iptvos_xt_host', USER:'iptvos_xt_user', PASS:'iptvos_xt_pass',
       FAVS:'iptvos_favorites', CONTINUE:'iptvos_continue_watching', CAT:'iptvos_category' },
  saveCreds(h,u,p){ this._s(this.K.HOST,h); this._s(this.K.USER,u); this._s(this.K.PASS,p); },
  getCreds(){ return { host:this._g(this.K.HOST)||'', user:this._g(this.K.USER)||'', pass:this._g(this.K.PASS)||'' }; },
  saveFavs(f){ this._s(this.K.FAVS, JSON.stringify(f)); },
  loadFavs(){ return this._json(this.K.FAVS, {channels:{}, movies:{}, series:{}}); },
  saveContinueWatching(c){ this._s(this.K.CONTINUE, JSON.stringify(c)); },
  loadContinueWatching(){ return this._json(this.K.CONTINUE, {}); },
  saveCat(c){ this._s(this.K.CAT, c); },
  getCat(){ return this._g(this.K.CAT)||'Todos'; },
  _s(k,v){ try{ localStorage.setItem(k,v); }catch{} },
  _g(k){ try{ return localStorage.getItem(k); }catch{ return null; } },
  _json(k,fallback){
    try{
      const raw=this._g(k);
      if(!raw) return fallback;
      const parsed=JSON.parse(raw);
      return parsed&&typeof parsed==='object'?parsed:fallback;
    }catch{ return fallback; }
  },
};

const Favorites = {
  init(){ App.favorites = this._normalize(Storage.loadFavs()); },
  getFavorites(){ return this._normalize(App.favorites); },
  saveFavorites(favs){ App.favorites=this._normalize(favs); Storage.saveFavs(App.favorites); },
  isFavorite(type,id){
    const bucket=this._bucket(type);
    return !!(App.favorites[bucket]&&App.favorites[bucket][String(id)]);
  },
  isFav(id){ return this.isFavorite('channels', id); },
  addFavorite(type,item){
    const bucket=this._bucket(type), id=this._id(item);
    if(!id) return false;
    App.favorites[bucket][id]=this._shape(bucket,item,id);
    this.saveFavorites(App.favorites);
    return true;
  },
  removeFavorite(type,id){
    const bucket=this._bucket(type), key=String(id);
    if(!App.favorites[bucket]||!App.favorites[bucket][key]) return false;
    delete App.favorites[bucket][key];
    this.saveFavorites(App.favorites);
    return true;
  },
  toggleFavorite(type,item){
    const bucket=this._bucket(type), id=this._id(item);
    if(!id) return false;
    const wasFav=this.isFavorite(bucket,id);
    if(wasFav) this.removeFavorite(bucket,id);
    else this.addFavorite(bucket,item);
    this._toast(`${wasFav?'Removido dos':'Adicionado aos'} favoritos: ${item.name||item.title||'Item'}`);
    this.refreshUI(bucket);
    return !wasFav;
  },
  toggle(ch){ return this.toggleFavorite('channels', ch); },
  getChannels(){ return App.allChannels.filter(c=>this.isFavorite('channels', this._id(c))); },
  getVod(type){ return App.allVod.filter(i=>this.isFavorite(type, this._id(i))); },
  count(type){ const b=this._bucket(type); return Object.keys(App.favorites[b]||{}).length; },
  refreshUI(bucket){
    const npFav = document.getElementById('np-fav-indicator');
    if(npFav&&App.playerMode==='live'){
      const ch=App.filteredChannels[App.currentChannelIndex];
      if(ch) npFav.textContent = this.isFavorite('channels', this._id(ch))?'*':'☆';
    }
    UI.updateDetailFavorite();
    if(bucket==='channels'){
      App.liveCategories=Parser.catList(App.allChannels, this.count('channels'));
      UI.renderLiveCats(App.liveCategories);
      if(/Favoritos/.test(App.currentCategory)) Actions.applyLiveFilters();
      else UI.renderLiveGrid();
    } else if((bucket==='movies'&&App.vodMode==='movies')||(bucket==='series'&&App.vodMode==='series')){
      App.vodCategories=Parser.catList(App.allVod, this.count(bucket));
      UI.renderVodCats(App.vodCategories);
      if(/Favoritos/.test(App.vodCurrentCategory)) Actions.applyVodFilters();
      else UI.renderVodGrid();
    }
    UI.renderHomeContinue();
  },
  _bucket(type){
    if(type==='channel') return 'channels';
    if(type==='movie') return 'movies';
    if(type==='series') return 'series';
    return type==='channels'||type==='movies'||type==='series'?type:'channels';
  },
  _id(item){ return String(item&&((item.id!=null&&item.id!=='')?item.id:item.url)||''); },
  _shape(bucket,item,id){
    const isChannel=bucket==='channels';
    return {
      id:String(id),
      name:item.name||item.title||'Item',
      logo:isChannel?(item.logo||''):undefined,
      cover:!isChannel?(item.logo||item.cover||''):undefined,
      type:bucket.replace(/s$/,''),
      savedAt:Date.now()
    };
  },
  _normalize(raw){
    const base={channels:{}, movies:{}, series:{}};
    if(Array.isArray(raw)){
      raw.forEach(url=>{ if(url) base.channels[String(url)]={id:String(url),name:'Canal favorito',logo:'',type:'channel',savedAt:Date.now()}; });
      return base;
    }
    ['channels','movies','series'].forEach(k=>{ if(raw&&raw[k]&&typeof raw[k]==='object') base[k]=raw[k]; });
    return base;
  },
  _toast(msg){
    let t=document.getElementById('fav-toast');
    if(!t){ t=document.createElement('div'); t.id='fav-toast'; t.className='fav-toast'; document.body.appendChild(t); }
    t.textContent=msg; t.classList.add('visible');
    clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('visible'),2500);
  },
};

/* ─────────────────────────────────────────────────────────────
   4. FAVORITOS
   ───────────────────────────────────────────────────────────── */
const getFavorites=()=>Favorites.getFavorites();
const saveFavorites=favs=>Favorites.saveFavorites(favs);
const isFavorite=(type,id)=>Favorites.isFavorite(type,id);
const toggleFavorite=(type,item)=>Favorites.toggleFavorite(type,item);
const addFavorite=(type,item)=>Favorites.addFavorite(type,item);
const removeFavorite=(type,id)=>Favorites.removeFavorite(type,id);

const ContinueWatching = {
  init(){
    App.continueWatching=this._normalize(Storage.loadContinueWatching());
    Storage.saveContinueWatching(App.continueWatching);
  },
  getContinueWatching(){ return this._normalize(App.continueWatching); },
  saveContinueWatching(data){
    const items=Object.values(this._normalize(data)).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,20);
    App.continueWatching={};
    items.forEach(item=>{ App.continueWatching[this._key(item.seriesId)]=item; });
    Storage.saveContinueWatching(App.continueWatching);
    UI.renderHomeContinue();
  },
  updateEpisodeProgress(seriesData, episodeData, currentTime, duration){
    if(!seriesData||!episodeData) return null;
    const seriesId=String(seriesData.id||seriesData.seriesId||'');
    const episodeId=String(episodeData.id||episodeData.episodeId||'');
    if(!seriesId||!episodeId) return null;
    const dur=Math.max(0, Number(duration)||0);
    const cur=Math.max(0, Number(currentTime)||0);
    const progress=dur>0?Math.min(100,(cur/dur)*100):0;
    const key=this._key(seriesId);
    const item={
      seriesId,
      seriesName:seriesData.name||seriesData.seriesName||'Serie',
      seasonId:String(episodeData.seasonId||episodeData.seasonNumber||''),
      seasonNumber:Number(episodeData.seasonNumber||episodeData.season||0)||0,
      episodeId,
      episodeNumber:Number(episodeData.episodeNumber||episodeData.episode_num||0)||0,
      episodeName:episodeData.episodeName||episodeData.title||episodeData.name||'Episodio',
      thumbnail:episodeData.thumbnail||episodeData.cover||seriesData.logo||seriesData.cover||'',
      currentTime:cur,
      duration:dur,
      progress:Math.round(progress*100)/100,
      completed:progress>=90,
      updatedAt:Date.now()
    };
    const hasSeasonData=App.seasonEpisodes&&Object.keys(App.seasonEpisodes).length;
    if(item.completed&&hasSeasonData&&!this.getNextEpisode(seriesId,item.seasonNumber,item.episodeNumber)){
      delete App.continueWatching[key];
      this.saveContinueWatching(App.continueWatching);
      return null;
    }
    App.continueWatching[key]=item;
    this.saveContinueWatching(App.continueWatching);
    return item;
  },
  saveCurrentVideo(){
    const v=Player.video;
    const item=App.currentVodItem;
    if(!v||!item||item.mediaType!=='episode') return null;
    return this.updateEpisodeProgress(item.seriesData||App.currentDetail, item.episodeData||item, v.currentTime, v.duration);
  },
  getLastWatchedEpisode(seriesId){
    return Object.values(App.continueWatching||{})
      .filter(i=>String(i.seriesId)===String(seriesId))
      .sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0]||null;
  },
  getNextEpisode(seriesId, seasonNumber, episodeNumber){
    const seasons=App.seasonEpisodes||{};
    const seasonKeys=Object.keys(seasons).sort((a,b)=>Number(a)-Number(b));
    for(const sn of seasonKeys){
      if(Number(sn)<Number(seasonNumber)) continue;
      const eps=(seasons[sn]||[]).slice().sort((a,b)=>Number(a.episode_num||0)-Number(b.episode_num||0));
      for(let i=0;i<eps.length;i++){
        const ep=eps[i];
        const epNum=Number(ep.episode_num||i+1);
        if(Number(sn)>Number(seasonNumber)||epNum>Number(episodeNumber)){
          return {seasonNumber:Number(sn), episode:ep, episodeNumber:epNum};
        }
      }
    }
    return null;
  },
  removeContinueWatchingItem(key){
    if(App.continueWatching&&App.continueWatching[key]){
      delete App.continueWatching[key];
      this.saveContinueWatching(App.continueWatching);
    }
  },
  clearCompletedIfNeeded(){ this.saveContinueWatching(App.continueWatching); },
  _key(seriesId){ return String(seriesId); },
  _normalize(raw){
    const out={};
    if(!raw||typeof raw!=='object') return out;
    Object.keys(raw).forEach(k=>{
      const item=raw[k];
      if(!item||!item.seriesId||!item.episodeId) return;
      const key=this._key(item.seriesId);
      const prev=out[key];
      if(!prev||(item.updatedAt||0)>=(prev.updatedAt||0)) out[key]=item;
    });
    return out;
  }
};

const getContinueWatching=()=>ContinueWatching.getContinueWatching();
const saveContinueWatching=data=>ContinueWatching.saveContinueWatching(data);
const updateEpisodeProgress=(seriesData,episodeData,currentTime,duration)=>ContinueWatching.updateEpisodeProgress(seriesData,episodeData,currentTime,duration);
const getLastWatchedEpisode=seriesId=>ContinueWatching.getLastWatchedEpisode(seriesId);
const getNextEpisode=(seriesId,seasonNumber,episodeNumber)=>ContinueWatching.getNextEpisode(seriesId,seasonNumber,episodeNumber);
const removeContinueWatchingItem=key=>ContinueWatching.removeContinueWatchingItem(key);
const clearCompletedIfNeeded=()=>ContinueWatching.clearCompletedIfNeeded();

const LegacyFavorites = {
  init(){ App.favorites = Storage.loadFavs(); },
  isFav(url){ return App.favorites.includes(url); },
  toggle(ch){
    const i = App.favorites.indexOf(ch.url);
    if(i===-1){ App.favorites.push(ch.url); this._toast(`★ ${ch.name} adicionado`); }
    else{ App.favorites.splice(i,1); this._toast(`✕ ${ch.name} removido`); }
    Storage.saveFavs(App.favorites);
    const npFav = document.getElementById('np-fav-indicator');
    if(npFav) npFav.textContent = this.isFav(ch.url)?'★':'☆';
    if(App.currentCategory==='★ Favoritos') Actions.applyLiveFilters();
  },
  getChannels(){ return App.allChannels.filter(c=>this.isFav(c.url)); },
  _toast(msg){
    let t=document.getElementById('fav-toast');
    if(!t){ t=document.createElement('div'); t.id='fav-toast'; t.className='fav-toast'; document.body.appendChild(t); }
    t.textContent=msg; t.classList.add('visible');
    clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('visible'),2500);
  },
};

/* ─────────────────────────────────────────────────────────────
   5. XTREAM API
   ───────────────────────────────────────────────────────────── */
const XtreamAPI = {
  normalize(raw){
    let h=raw.trim();
    if(!/^https?:\/\//i.test(h)) h='http://'+h;
    return h.replace(/\/+$/,'');
  },
  url(host,user,pass,action,extra=''){
    return `${host}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${action}${extra}`;
  },
  liveUrl(host,user,pass,id){ return `${host}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${id}.m3u8`; },
  liveUrlTs(host,user,pass,id){ return `${host}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${id}.ts`; },
  vodUrl(host,user,pass,id,ext='mp4'){ return `${host}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${id}.${ext}`; },
  seriesEpUrl(host,user,pass,id,ext='mp4'){ return `${host}/series/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${id}.${ext}`; },

  async fetch(url){
    const ctrl=new AbortController();
    const t=setTimeout(()=>ctrl.abort(),25000);
    try{
      const res=await fetch(url,{signal:ctrl.signal,headers:{Accept:'application/json'}});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }finally{ clearTimeout(t); }
  },

  async get(action, extra=''){
    const {host,user,pass}={host:App.xtHost,user:App.xtUser,pass:App.xtPass};
    const u=this.url(host,user,pass,action,extra);
    try{ return await this.fetch(u); }
    catch(e){
      return await this.fetch(App.CORS_PROXY+encodeURIComponent(u));
    }
  },

  async getLive(){      return this.get('get_live_streams'); },
  async getLiveCats(){  return this.get('get_live_categories'); },
  async getMovies(){    return this.get('get_vod_streams'); },
  async getMovieCats(){ return this.get('get_vod_categories'); },
  async getSeries(){    return this.get('get_series'); },
  async getSeriesCats(){ return this.get('get_series_categories'); },
  async getSeriesInfo(id){ return this.get('get_series_info', `&series_id=${id}`); },
};

/* ─────────────────────────────────────────────────────────────
   6. PARSERS
   ───────────────────────────────────────────────────────────── */
const Parser = {
  buildCatMap(cats){
    const m={};
    if(Array.isArray(cats)) cats.forEach(c=>{ if(c.category_id) m[String(c.category_id)]=c.category_name||'Sem Categoria'; });
    return m;
  },
  catList(items, favLen=0){
    const s=new Set(items.map(c=>c.group));
    return [...(favLen?['★ Favoritos']:[]),'Todos',...Array.from(s).sort()];
  },

  parseLive(streams, catMap){
    return streams.filter(s=>s.stream_id).map(s=>({
      id:   s.stream_id,
      name:(s.name||'Canal').trim(),
      logo:s.stream_icon||'',
      group:catMap[String(s.category_id||'')]||s.category_name||'Sem Categoria',
      url: XtreamAPI.liveUrl(App.xtHost,App.xtUser,App.xtPass,s.stream_id),
      urlTs:XtreamAPI.liveUrlTs(App.xtHost,App.xtUser,App.xtPass,s.stream_id),
      fav:  Favorites.isFavorite('channels', s.stream_id),
    }));
  },

  parseMovies(streams, catMap){
    return streams.filter(s=>s.stream_id).map(s=>({
      id:   s.stream_id,
      name: (s.name||'Filme').trim(),
      logo: s.stream_icon||s.cover||'',
      group:catMap[String(s.category_id||'')]||s.category_name||'Sem Categoria',
      year: s.year||s.releaseDate||'',
      rating:s.rating_5based? (parseFloat(s.rating_5based)*2).toFixed(1)+' ⭐' : s.rating||'',
      duration: s.duration||'',
      plot: s.plot||'',
      genre:s.genre||'',
      ext:  s.container_extension||'mp4',
      url:  XtreamAPI.vodUrl(App.xtHost,App.xtUser,App.xtPass,s.stream_id, s.container_extension||'mp4'),
      type:'movie',
    }));
  },

  parseSeries(list, catMap){
    return list.filter(s=>s.series_id).map(s=>({
      id:   s.series_id,
      name: (s.name||'Série').trim(),
      logo: s.cover||'',
      group:catMap[String(s.category_id||'')]||s.category_name||'Sem Categoria',
      year: s.first_air_date||s.releaseDate||'',
      rating:s.rating? parseFloat(s.rating).toFixed(1)+' ⭐' : '',
      plot: s.plot||'',
      genre:s.genre||s.cast||'',
      type:'series',
    }));
  },
};

/* ─────────────────────────────────────────────────────────────
   7. PAGINAÇÃO VIRTUAL (live)
   ───────────────────────────────────────────────────────────── */
const VirtualGrid = {
  reset(){ App.currentPage=0; App.totalPages=Math.ceil(App.filteredChannels.length/App.PAGE_SIZE); },
  getPage(){ const s=App.currentPage*App.PAGE_SIZE; return App.filteredChannels.slice(s,s+App.PAGE_SIZE); },
  localToGlobal(l){ return App.currentPage*App.PAGE_SIZE+l; },
  globalToLocal(g){ return g-App.currentPage*App.PAGE_SIZE; },
  next(){ if(App.currentPage<App.totalPages-1){ App.currentPage++; UI.renderLiveGrid(); Nav.setGridFocus(0); return true; } return false; },
  prev(){ if(App.currentPage>0){ App.currentPage--; UI.renderLiveGrid(); Nav.setGridFocus(VirtualGrid.getPage().length-1); return true; } return false; },
};

/* Paginação VOD */
const VodGrid = {
  reset(){ App.vodCurrentPage=0; App.vodTotalPages=Math.ceil(App.filteredVod.length/App.vodPageSize); },
  getPage(){ const s=App.vodCurrentPage*App.vodPageSize; return App.filteredVod.slice(s,s+App.vodPageSize); },
  localToGlobal(l){ return App.vodCurrentPage*App.vodPageSize+l; },
  next(){ if(App.vodCurrentPage<App.vodTotalPages-1){ App.vodCurrentPage++; UI.renderVodGrid(); Nav.setVodGridFocus(0); return true; } return false; },
  prev(){ if(App.vodCurrentPage>0){ App.vodCurrentPage--; UI.renderVodGrid(); Nav.setVodGridFocus(VodGrid.getPage().length-1); return true; } return false; },
};

/* ─────────────────────────────────────────────────────────────
   8. PLAYER
   ───────────────────────────────────────────────────────────── */
const Player = {
  video:null,
  _seekInterval:null,
  subtitleObjectUrl:null,
  subtitleRequestId:0,

  init(){
    this.video=document.getElementById('video-player');
    if(this.video) this.video.setAttribute('crossorigin','anonymous');
    this._bind();
  },

  play(ch){
    this._clear();
    App.playerMode='live';
    this.setSubtitles('');
    UI.setVideoError(false); UI.setBuffering(true);
    UI.updateNowPlaying(ch);

    const v=this.video;
    const url=ch.url;

    if(Hls.isSupported()&&/m3u8/i.test(url)){
      const hls=new Hls({enableWorker:true,startLevel:-1,maxBufferLength:30});
      App.hlsInstance=hls;
      hls.loadSource(url); hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{ UI.setBuffering(false); UI.setStatus('▶ Reproduzindo'); v.play().catch(console.warn); });
      hls.on(Hls.Events.ERROR,(_,d)=>{
        if(d.fatal){
          if(ch.urlTs&&url!==ch.urlTs){ this._clear(); this._playDirect({...ch,url:ch.urlTs}); }
          else{ UI.setBuffering(false); UI.setVideoError(true,`HLS: ${d.details}`); }
        }
      });
    } else {
      this._playDirect(ch);
    }
  },

  playVod(item, subLabel=''){
    ContinueWatching.saveCurrentVideo();
    this._clear();
    App.playerMode='vod';
    App.currentVodItem=item;
    App.nextEpisodeTarget=null;
    App.nextEpisodePromptShown=false;
    UI.setVideoError(false); UI.setBuffering(true);
    UI.hideNextEpisodeOption();

    // Atualiza overlay VOD
    document.getElementById('vod-np-name').textContent=item.name||item.title||'';
    document.getElementById('vod-np-sub').textContent=subLabel;
    document.getElementById('vod-progress-bar').style.width='0%';
    document.getElementById('vod-progress-cursor').style.left='0%';
    document.getElementById('vod-current-time').textContent='0:00:00';
    document.getElementById('vod-total-time').textContent='0:00:00';
    document.getElementById('vod-playback-status').textContent='A carregar...';

    const v=this.video;
    const url=item.url;
    const resumeAt=Number(item.startTime)||0;
    const resume=()=>{ if(resumeAt>5&&isFinite(v.duration)&&resumeAt<v.duration-5) v.currentTime=resumeAt; };
    v.addEventListener('loadedmetadata', resume, {once:true});

    if(Hls.isSupported()&&/m3u8/i.test(url)){
      const hls=new Hls({enableWorker:true,startLevel:-1,maxBufferLength:60});
      App.hlsInstance=hls;
      hls.loadSource(url); hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{ UI.setBuffering(false); v.play().catch(console.warn); });
      hls.on(Hls.Events.ERROR,(_,d)=>{ if(d.fatal){ UI.setBuffering(false); UI.setVideoError(true,`HLS: ${d.details}`); } });
    } else {
      v.src=url; v.load();
      v.play().catch(e=>{ UI.setBuffering(false); UI.setVideoError(true,e.message); });
    }
    this.setSubtitles(getSubtitleUrl(item));
    this._startSeekInterval();
  },

  setSubtitles(url){
    const v=this.video;
    if(!v) return null;
    const requestId=++this.subtitleRequestId;

    v.querySelectorAll('track').forEach(track=>track.remove());
    if(this.subtitleObjectUrl){
      URL.revokeObjectURL(this.subtitleObjectUrl);
      this.subtitleObjectUrl=null;
    }
    if(!url||!/\.srt($|\?|\#)|\.vtt($|\?|\#)/i.test(url)) return null;

    if(/\.srt($|\?|\#)/i.test(url)){
      fetch(url)
        .then(r=>{
          if(!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })
        .then(text=>{
          if(requestId!==this.subtitleRequestId) return;
          const blob=new Blob([this._srtToVtt(text)], {type:'text/vtt'});
          this.subtitleObjectUrl=URL.createObjectURL(blob);
          this.loadExternalSubs(this.subtitleObjectUrl);
        })
        .catch(err=>{
          if(requestId!==this.subtitleRequestId) return;
          console.warn('[setSubtitles] Nao foi possivel converter SRT:', err);
          this.loadExternalSubs(url);
        });
      return null;
    }

    return this.loadExternalSubs(url);
  },

  loadExternalSubs(url){
    const v=this.video;
    if(!v) return null;
    const track=document.createElement('track');
    track.kind='subtitles';
    track.label='Português';
    track.srclang='pt';
    track.src=url;
    track.default=true;
    v.appendChild(track);

    const forceShowing=()=>{
      if(track.track) track.track.mode='showing';
      setTimeout(()=>{
        if(v.textTracks&&v.textTracks[0]) v.textTracks[0].mode='showing';
        if(track.track) track.track.mode='showing';
      },500);
    };
    track.addEventListener('load',forceShowing,{once:true});
    forceShowing();
    return track;
  },

  _srtToVtt(text){
    const body=String(text||'')
      .replace(/^\uFEFF/,'')
      .replace(/\r+/g,'')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2')
      .replace(/^\d+\n(?=\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+)/gm,'');
    return /^WEBVTT/i.test(body) ? body : `WEBVTT\n\n${body}`;
  },

  seek(delta){
    const v=this.video;
    if(!v||!isFinite(v.duration)) return;
    v.currentTime=Math.max(0,Math.min(v.currentTime+delta,v.duration));
    UI.updateVodProgress(v);
    document.getElementById('vod-playback-status').textContent=delta>0?`⏩ +${Math.abs(delta)}s`:`⏪ -${Math.abs(delta)}s`;
    UI.showVodOverlay();
  },

  _startSeekInterval(){
    clearInterval(this._seekInterval);
    this._seekInterval=setInterval(()=>{
      const v=this.video;
      if(v&&!v.paused&&isFinite(v.duration)){
        UI.updateVodProgress(v);
        this._checkNextEpisodeOption(v);
      }
    },500);
  },

  _checkNextEpisodeOption(v){
    const item=App.currentVodItem;
    if(!item||item.mediaType!=='episode'||!isFinite(v.duration)||v.duration<90){
      UI.hideNextEpisodeOption();
      return;
    }
    const data=item.episodeData||item;
    const next=ContinueWatching.getNextEpisode((item.seriesData||App.currentDetail||{}).id, data.seasonNumber, data.episodeNumber);
    const remaining=v.duration-v.currentTime;
    if(next&&remaining>0&&remaining<=60){
      App.nextEpisodeTarget=next;
      if(!App.nextEpisodePromptShown){
        App.nextEpisodePromptShown=true;
        UI.showNextEpisodeOption(next);
        UI.showVodOverlay();
        clearTimeout(App.overlayTimer);
        App.overlayTimer=setTimeout(()=>UI.hideOverlay(),15000);
      }
    }else if(remaining>65){
      App.nextEpisodeTarget=null;
      App.nextEpisodePromptShown=false;
      UI.hideNextEpisodeOption();
    }
  },

  stop(){
    ContinueWatching.saveCurrentVideo();
    this._clear();
    clearInterval(this._seekInterval);
    App.nextEpisodeTarget=null;
    App.nextEpisodePromptShown=false;
    UI.hideNextEpisodeOption();
    if(this.video){
      this.video.pause();
      this.setSubtitles('');
      this.video.removeAttribute('src');
      this.video.load();
    }
  },

  _clear(){ if(App.hlsInstance){ App.hlsInstance.destroy(); App.hlsInstance=null; } },

  _playDirect(ch){
    const v=this.video;
    v.src=ch.url; v.load();
    v.play().catch(e=>{ UI.setBuffering(false); UI.setVideoError(true,e.message); });
  },

  _bind(){
    const v=this.video;
    v.addEventListener('waiting', ()=>UI.setBuffering(true));
    v.addEventListener('playing', ()=>{ UI.setBuffering(false); UI.setStatus('▶ Reproduzindo'); document.getElementById('vod-playback-status').textContent='▶ Reproduzindo'; });
    v.addEventListener('stalled', ()=>{ UI.setStatus('⚠ Stream instável...'); });
    v.addEventListener('error',   ()=>{ UI.setBuffering(false); UI.setVideoError(true,'Erro de reprodução.'); });
    v.addEventListener('timeupdate',()=>{
      if(App.playerMode==='vod'){
        UI.updateVodProgress(v);
        if(App.currentVodItem&&App.currentVodItem.mediaType==='episode'&&Date.now()-App.lastProgressSaveAt>10000){
          App.lastProgressSaveAt=Date.now();
          ContinueWatching.saveCurrentVideo();
        }
      }
    });
    v.addEventListener('pause',()=>ContinueWatching.saveCurrentVideo());
    v.addEventListener('ended',()=>ContinueWatching.saveCurrentVideo());
  },

  next(){ const t=App.filteredChannels.length; if(!t)return; App.currentChannelIndex=(App.currentChannelIndex+1)%t; this.play(App.filteredChannels[App.currentChannelIndex]); },
  prev(){ const t=App.filteredChannels.length; if(!t)return; App.currentChannelIndex=(App.currentChannelIndex-1+t)%t; this.play(App.filteredChannels[App.currentChannelIndex]); },
};

/* ─────────────────────────────────────────────────────────────
   9. INTERFACE
   ───────────────────────────────────────────────────────────── */
const UI = {

  showScreen(name, options={}){
    const previous=App.currentScreen;
    if(options.resetStack) App.navStack=[];
    if(previous&&previous!==name&&!options.skipStack){
      App.navStack.push(previous);
      if(App.navStack.length>30) App.navStack.shift();
    }
    ['setup','home','player','vod','detail','video'].forEach(s=>{
      const el=document.getElementById(`screen-${s}`);
      if(el) el.classList.toggle('hidden', s!==name);
    });
    App.currentScreen=name;
    currentScreen=screenToPublicState(name);

    // Declara para onde o BACK deve voltar nesta página
    if(name==='home' || name==='setup') tvSetBackUrl(null);
    else if(name==='player' || name==='vod') tvSetBackUrl('screen:home');
    else if(name==='detail') tvSetBackUrl('screen:vod');

    if(name==='home'){
      this.renderHomeContinue();
      this.setHomeFocus(0);
    }
    setTimeout(()=>forceFocus(`screen-${name}`),0);
  },

  /* ── Login ── */
  setLoginLoading(on){
    document.getElementById('btn-login-text').textContent=on?'Conectando...':'Entrar';
    document.getElementById('btn-login-spinner').classList.toggle('hidden',!on);
    document.getElementById('btn-login').disabled=on;
    ['xt-host','xt-user','xt-pass'].forEach(id=>document.getElementById(id).disabled=on);
  },
  setSetupStatus(msg,type='error'){
    const el=document.getElementById('setup-status');
    el.textContent=msg; el.className=`setup-status ${type}`; el.classList.remove('hidden');
  },
  hideSetupStatus(){ document.getElementById('setup-status').classList.add('hidden'); },

  LOGIN_FIELDS:['xt-host','xt-user','xt-pass','btn-login'],
  setLoginFocus(id){
    App.loginFocus=id;
    this.LOGIN_FIELDS.forEach(fid=>{
      const el=document.getElementById(fid);
      if(!el)return;
      el.classList.toggle('focused',fid===id);
      if(fid===id){
        if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
        el.focus({preventScroll:true});
      } else if(el.tagName==='INPUT') el.blur();
    });
  },

  /* ── Home ── */
  setHomeFocus(idx){
    App.homeFocus=idx;
    const cards=[...document.querySelectorAll('.home-card')];
    cards.forEach((c,i)=>c.classList.toggle('focused',idx===i));
    document.querySelectorAll('.continue-card').forEach((c,i)=>c.classList.toggle('focused',idx===cards.length+i));
    const target=document.querySelector('#screen-home .focusable.focused')||document.querySelector('#screen-home .focusable');
    if(target){
      if(!target.hasAttribute('tabindex')) target.setAttribute('tabindex','0');
      target.focus({preventScroll:true});
    }
  },

  renderHomeContinue(){
    const wrap=document.getElementById('continue-section');
    const list=document.getElementById('continue-list');
    if(!wrap||!list) return;
    App.continueWatching=ContinueWatching.getContinueWatching();
    const items=Object.values(App.continueWatching||{}).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,20);
    App.homeContinueItems=items;
    wrap.classList.toggle('hidden',!items.length);
    list.innerHTML='';
    if(!items.length) return;
    const frag=document.createDocumentFragment();
    items.slice(0,6).forEach((item,i)=>{
      const card=document.createElement('div');
      card.className='continue-card focusable';
      card.dataset.index=i;
      const pct=Math.max(0,Math.min(100,Number(item.progress)||0));
      const title=item.completed?'Proximo episodio sugerido':'Continuar';
      card.innerHTML=`<div class="continue-thumb">${item.thumbnail?`<img src="${escHtml(item.thumbnail)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">`:''}</div><div class="continue-info"><div class="continue-title">${escHtml(item.seriesName||'Serie')}</div><div class="continue-sub">T${item.seasonNumber||'?'} E${item.episodeNumber||'?'} - ${escHtml(item.episodeName||'Episodio')}</div><div class="continue-progress"><span style="width:${pct}%"></span></div><div class="continue-action">${title}</div></div>`;
      card.addEventListener('click',()=>Actions.openContinueItem(i));
      frag.appendChild(card);
    });
    list.appendChild(frag);
    this.setHomeFocus(App.homeFocus);
  },

  /* ── Parsing overlay ── */
  showParsing(show,msg=''){
    let el=document.getElementById('parsing-overlay');
    if(show){
      if(!el){
        el=document.createElement('div'); el.id='parsing-overlay'; el.className='parsing-overlay';
        el.innerHTML=`<div class="parsing-card">
          <div class="parsing-spinner-wrap">
            <svg class="parsing-svg" viewBox="0 0 64 64">
              <circle class="parsing-track" cx="32" cy="32" r="28"/>
              <circle class="parsing-ring"  cx="32" cy="32" r="28"/>
            </svg>
            <span class="parsing-icon-inner">▶</span>
          </div>
          <div id="parsing-title" class="parsing-title"></div>
          <div class="parsing-bar-track"><div id="parsing-bar" class="parsing-bar"></div></div>
          <div id="parsing-sub" class="parsing-sub">Iniciando...</div>
        </div>`;
        document.body.appendChild(el);
      }
      document.getElementById('parsing-title').textContent=msg;
      el.classList.add('visible');
      this._runBar();
    } else {
      if(el){ el.classList.remove('visible'); clearInterval(this._barInt); }
    }
  },
  _barInt:null,
  _runBar(){
    const steps=[[10,'Conectando...'],[30,'Autenticando...'],[55,'Baixando conteúdo...'],[75,'Organizando categorias...'],[90,'Preparando interface...'],[97,'Quase lá...']];
    let i=0; clearInterval(this._barInt);
    const bar=document.getElementById('parsing-bar'), sub=document.getElementById('parsing-sub');
    if(bar) bar.style.width='0%';
    this._barInt=setInterval(()=>{ if(i>=steps.length){clearInterval(this._barInt);return;} if(bar)bar.style.width=steps[i][0]+'%'; if(sub)sub.textContent=steps[i][1]; i++; },500);
  },

  /* ── Live categories ── */
  renderLiveCats(cats){
    const list=document.getElementById('category-list'); list.innerHTML='';
    const frag=document.createDocumentFragment();
    cats.forEach((cat,i)=>{
      let count=cat==='★ Favoritos'?App.favorites.length:cat==='Todos'?App.allChannels.length:App.allChannels.filter(c=>c.group===cat).length;
      const el=document.createElement('div');
      if(/Favoritos/.test(cat)) count=Favorites.count('channels');
      el.className='category-item focusable'; el.dataset.index=i; el.dataset.cat=cat;
      el.innerHTML=`<span class="cat-name">${escHtml(cat)}</span><span class="cat-count">${count}</span>`;
      el.addEventListener('click',()=>Nav.selectLiveCat(i));
      frag.appendChild(el);
    });
    list.appendChild(frag);
  },

  /* ── Live grid ── */
  renderLiveGrid(){
    const grid=document.getElementById('channel-grid');
    const channels=VirtualGrid.getPage();
    const total=App.filteredChannels.length;
    grid.innerHTML='';
    document.getElementById('channel-count').textContent=`${total} canais`;
    this._renderPag('pagination-bar',App.currentPage,App.totalPages,App.currentPage*App.PAGE_SIZE,total,App.PAGE_SIZE);
    if(!total){ grid.innerHTML=`<div class="grid-empty"><span>📭</span><p>Nenhum canal encontrado</p></div>`; return; }
    const frag=document.createDocumentFragment();
    channels.forEach((ch,li)=>{
      const isFav=Favorites.isFavorite('channels', ch.id||ch.url);
      const card=document.createElement('div');
      card.className=`channel-card focusable${isFav?' is-fav':''}`;
      card.dataset.index=li;
      const logoHtml=ch.logo?`<img class="ch-logo" src="${escHtml(ch.logo)}" alt="" loading="lazy" decoding="async" onerror="this.outerHTML='<div class=\\'ch-ph\\'>📺</div>'">`:`<div class="ch-ph">📺</div>`;
      card.innerHTML=`${isFav?'<div class="fav-badge">★</div>':''}<div class="ch-logo-wrap">${logoHtml}</div><div class="ch-name">${escHtml(ch.name)}</div><div class="ch-group">${escHtml(ch.group)}</div>`;
      card.addEventListener('click',()=>Nav.openLiveChannel(li));
      frag.appendChild(card);
    });
    grid.appendChild(frag);
    if(App.focusZone==='search') document.getElementById('search-input').focus({preventScroll:true});
    else this.updateGridFocus(App.gridFocusIndex);
  },

  /* ── VOD categories ── */
  renderVodCats(cats){
    const list=document.getElementById('vod-category-list'); list.innerHTML='';
    const frag=document.createDocumentFragment();
    cats.forEach((cat,i)=>{
      let count=cat==='Todos'?App.allVod.length:App.allVod.filter(c=>c.group===cat).length;
      const el=document.createElement('div');
      if(/Favoritos/.test(cat)) count=Favorites.count(App.vodMode);
      el.className='category-item focusable'; el.dataset.index=i;
      el.innerHTML=`<span class="cat-name">${escHtml(cat)}</span><span class="cat-count">${count}</span>`;
      el.addEventListener('click',()=>Nav.selectVodCat(i));
      frag.appendChild(el);
    });
    list.appendChild(frag);
  },

  /* ── VOD grid ── */
  renderVodGrid(){
    const grid=document.getElementById('vod-grid');
    const items=VodGrid.getPage();
    const total=App.filteredVod.length;
    grid.innerHTML='';
    document.getElementById('vod-item-count').textContent=`${total} itens`;
    this._renderPag('vod-pagination-bar',App.vodCurrentPage,App.vodTotalPages,App.vodCurrentPage*App.vodPageSize,total,App.vodPageSize);
    if(!total){ grid.innerHTML=`<div class="grid-empty"><span>📭</span><p>Nenhum item encontrado</p></div>`; return; }
    const frag=document.createDocumentFragment();
    items.forEach((item,li)=>{
      const isFav=Favorites.isFavorite(item.type||App.vodMode, item.id);
      const card=document.createElement('div');
      card.className=`channel-card vod-card focusable${isFav?' is-fav':''}`;
      card.dataset.index=li;
      const posterHtml=item.logo?`<img class="vod-poster" src="${escHtml(item.logo)}" alt="" loading="lazy" decoding="async" onerror="this.outerHTML='<div class=\\'vod-poster-ph\\'>🎬</div>'">`:`<div class="vod-poster-ph">🎬</div>`;
      card.innerHTML=`${isFav?'<div class="fav-badge">*</div>':''}<div class="vod-poster-wrap">${posterHtml}</div><div class="ch-name">${escHtml(item.name)}</div><div class="ch-group">${escHtml(item.year||item.group)}</div>`;
      card.addEventListener('click',()=>Nav.openVodDetail(li));
      frag.appendChild(card);
    });
    grid.appendChild(frag);
    if(App.vodFocusZone==='search') document.getElementById('vod-search-input').focus({preventScroll:true});
    else this.updateVodGridFocus(App.vodGridFocusIndex);
  },

  /* ── Detail screen ── */
  async showDetail(item){
    App.currentDetail=item;
    App.detailFocus='play';

    document.getElementById('detail-backdrop').src=item.logo||'';
    document.getElementById('detail-poster').src=item.logo||'';
    document.getElementById('detail-badge').textContent=item.type==='movie'?'🎬 Filme':'📺 Série';
    document.getElementById('detail-title').textContent=item.name||'';
    document.getElementById('detail-year').textContent=item.year||'';
    document.getElementById('detail-rating').textContent=item.rating||'';
    document.getElementById('detail-duration').textContent=item.duration||'';
    document.getElementById('detail-genre').textContent=item.genre||'';
    document.getElementById('detail-plot').textContent=item.plot||'Sem descrição disponível.';

    const vodActions=document.getElementById('detail-vod-actions');
    const seriesActions=document.getElementById('detail-series-actions');
    this.updateDetailFavorite();

    if(item.type==='movie'){
      vodActions.classList.remove('hidden');
      seriesActions.classList.add('hidden');
      setTimeout(()=>this.setDetailFocus('play'),100);
    } else {
      vodActions.classList.add('hidden');
      seriesActions.classList.remove('hidden');
      // Busca info da série
      this.setDetailFocus('back');
      UI.showParsing(true,'Carregando episódios...');
      try{
        const info=await XtreamAPI.getSeriesInfo(item.id);
        this._renderSeriesEpisodes(info);
        UI.showParsing(false);
        this.setDetailFocus('season-0');
      }catch(e){
        UI.showParsing(false);
        document.getElementById('episode-list').innerHTML=`<div style="color:var(--txt-muted);padding:16px;">Erro ao carregar episódios.</div>`;
      }
    }
  },

  updateDetailFavorite(){
    const btn=document.getElementById('btn-fav-detail');
    if(!btn||!App.currentDetail) return;
    const fav=Favorites.isFavorite(App.currentDetail.type, App.currentDetail.id);
    btn.classList.toggle('is-fav', fav);
    btn.textContent=fav?'* Favorito':'☆ Favoritar';
  },

  _renderSeriesEpisodes(info){
    const seasons=info.episodes||{};
    App.seasonEpisodes=seasons;
    const seasonNums=Object.keys(seasons).sort((a,b)=>parseInt(a)-parseInt(b));
    if(!seasonNums.length){ document.getElementById('season-selector').innerHTML=''; document.getElementById('episode-list').innerHTML='<div style="color:var(--txt-muted);padding:16px;">Nenhum episódio disponível.</div>'; return; }

    // Botões de temporada
    const sel=document.getElementById('season-selector');
    sel.innerHTML='';
    seasonNums.forEach((sn,i)=>{
      const btn=document.createElement('button');
      btn.className='season-btn focusable'+(i===0?' active':'');
      btn.dataset.season=sn;
      btn.dataset.index=i;
      btn.textContent=`T${sn}`;
      btn.addEventListener('click',()=>{ this._selectSeason(sn); });
      sel.appendChild(btn);
    });

    const last=ContinueWatching.getLastWatchedEpisode(App.currentDetail&&App.currentDetail.id);
    const initialSeason=last&&seasonNums.includes(String(last.seasonNumber))?String(last.seasonNumber):seasonNums[0];
    App.currentSeason=initialSeason;
    document.querySelectorAll('.season-btn').forEach(b=>b.classList.toggle('active',b.dataset.season===initialSeason));
    this._renderEpisodes(initialSeason);
  },

  _selectSeason(sn){
    App.currentSeason=sn;
    document.querySelectorAll('.season-btn').forEach(b=>b.classList.toggle('active',b.dataset.season===sn));
    this._renderEpisodes(sn);
  },

  _renderEpisodes(sn){
    const eps=App.seasonEpisodes[sn]||[];
    const list=document.getElementById('episode-list');
    list.innerHTML='';
    if(!eps.length){ list.innerHTML='<div style="color:var(--txt-muted);padding:16px;">Nenhum episódio nesta temporada.</div>'; return; }
    const frag=document.createDocumentFragment();
    eps.forEach((ep,i)=>{
      const ext=ep.container_extension||'mp4';
      const url=XtreamAPI.seriesEpUrl(App.xtHost,App.xtUser,App.xtPass,ep.id,ext);
      const item=document.createElement('div');
      item.className='episode-item focusable';
      item.dataset.url=url;
      item.dataset.title=ep.title||`Episódio ${ep.episode_num||i+1}`;
      item.dataset.index=i;
      item.innerHTML=`<span class="ep-num">E${ep.episode_num||i+1}</span><span class="ep-title">${escHtml(ep.title||`Episódio ${ep.episode_num||i+1}`)}</span><span class="ep-duration">${(ep.info&&ep.info.duration)||ep.duration||''}</span>`;
      item.addEventListener('click',()=>this._playEpisode(url, ep.title||`Episódio ${ep.episode_num||i+1}`));
      frag.appendChild(item);
    });
    list.appendChild(frag);
  },

  _playEpisode(url, title, resumeTime=0){
    const eps=App.seasonEpisodes[App.currentSeason]||[];
    const ep=eps.find(e=>String(e.title||'')===String(title))||eps.find(e=>url.indexOf(String(e.id))!==-1)||{};
    const epIndex=Math.max(0, eps.indexOf(ep));
    const episodeData={id:ep.id||url, episodeId:ep.id||url, title:title||ep.title||'Episodio', episodeName:title||ep.title||'Episodio', seasonId:String(App.currentSeason||''), seasonNumber:Number(App.currentSeason)||0, episodeNumber:Number(ep.episode_num||epIndex+1)||epIndex+1, thumbnail:(ep.info&&ep.info.movie_image)||(ep.info&&ep.info.cover_big)||ep.cover||App.currentDetail.logo||''};
    const subtitleUrl=getSubtitleUrl(ep)||getSubtitleUrl(ep.info)||getSubtitleUrl(App.currentDetail);
    const item={...App.currentDetail, url, title:episodeData.title, mediaType:'episode', seriesData:App.currentDetail, episodeData, startTime:resumeTime, subtitle:subtitleUrl, subtitleUrl};
    Actions.playVodItem(item, `${App.currentDetail.name} — ${title}`);
  },

  setDetailFocus(id){
    App.detailFocus=id;
    document.querySelectorAll('.detail-btn, .season-btn, .episode-item').forEach(el=>el.classList.remove('focused'));
    let target=null;
    if(id==='play'){ const b=document.getElementById('btn-play-vod'); if(b){ b.classList.add('focused'); target=b; } }
    else if(id==='sub'){ const b=document.getElementById('btn-add-sub-detail'); if(b){ b.classList.add('focused'); target=b; } }
    else if(id==='back'){ const b=document.getElementById('btn-back-detail'); if(b){ b.classList.add('focused'); target=b; } }
    else if(id&&id.startsWith('season-')){
      const idx=parseInt(id.split('-')[1]);
      const btns=[...document.querySelectorAll('.season-btn')];
      if(btns[idx]){ btns[idx].classList.add('focused'); target=btns[idx]; }
    } else if(id&&id.startsWith('ep-')){
      const idx=parseInt(id.split('-')[1]);
      const eps=[...document.querySelectorAll('.episode-item')];
      if(eps[idx]){ eps[idx].classList.add('focused'); target=eps[idx]; eps[idx].scrollIntoView({block:'nearest',behavior:'smooth'}); }
    }
    if(target){
      if(!target.hasAttribute('tabindex')) target.setAttribute('tabindex','0');
      target.focus({preventScroll:true});
    }
  },

  /* ── Pagination helper ── */
  _renderPag(elId,curPage,totalPages,start,total,pageSize){
    const pag=document.getElementById(elId); if(!pag)return;
    if(totalPages<=1){pag.classList.add('hidden');return;}
    pag.classList.remove('hidden');
    const end=Math.min(start+pageSize,total);
    pag.innerHTML=`<span class="pag-pages">Pg. ${curPage+1}/${totalPages}</span><span class="pag-range">${start+1}–${end} de ${total}</span><span class="pag-hint">↑↓ navegar páginas</span>`;
  },

  /* ── Live focus helpers ── */
  updateGridFocus(idx){
    document.querySelectorAll('#channel-grid .channel-card').forEach((el,i)=>el.classList.toggle('focused',i===idx));
    const c=document.querySelector(`#channel-grid .channel-card[data-index="${idx}"]`);
    if(c){
      if(!c.hasAttribute('tabindex')) c.setAttribute('tabindex','0');
      c.focus({preventScroll:true});
      c.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  },
  updateLiveCatFocus(idx){
    document.querySelectorAll('#category-list .category-item').forEach((el,i)=>el.classList.toggle('focused',i===idx));
    const el=document.querySelector(`#category-list .category-item[data-index="${idx}"]`);
    if(el){
      if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
      el.focus({preventScroll:true});
      el.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  },
  updateLiveCatHL(idx){
    document.querySelectorAll('#category-list .category-item').forEach((el,i)=>el.classList.toggle('active',i===idx));
  },
  updateLiveCatTitle(n){ document.getElementById('category-title').textContent=n; },

  /* ── VOD focus helpers ── */
  updateVodGridFocus(idx){
    document.querySelectorAll('#vod-grid .channel-card').forEach((el,i)=>el.classList.toggle('focused',i===idx));
    const c=document.querySelector(`#vod-grid .channel-card[data-index="${idx}"]`);
    if(c){
      if(!c.hasAttribute('tabindex')) c.setAttribute('tabindex','0');
      c.focus({preventScroll:true});
      c.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  },
  updateVodCatFocus(idx){
    document.querySelectorAll('#vod-category-list .category-item').forEach((el,i)=>el.classList.toggle('focused',i===idx));
    const el=document.querySelector(`#vod-category-list .category-item[data-index="${idx}"]`);
    if(el){
      if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
      el.focus({preventScroll:true});
      el.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  },
  updateVodCatHL(idx){
    document.querySelectorAll('#vod-category-list .category-item').forEach((el,i)=>el.classList.toggle('active',i===idx));
  },
  updateVodCatTitle(n){ document.getElementById('vod-category-title').textContent=n; },

  /* ── Video overlay ── */
  updateNowPlaying(ch){
    document.getElementById('np-name').textContent=ch.name;
    document.getElementById('np-category').textContent=ch.group;
    const fav=document.getElementById('np-fav-indicator');
    if(fav) fav.textContent=Favorites.isFavorite('channels', ch.id||ch.url)?'★':'☆';
    const logo=document.getElementById('np-logo');
    logo.src=ch.logo||''; logo.style.display=ch.logo?'':'none';
  },
  setStatus(msg){ const el=document.getElementById('playback-status'); if(el)el.textContent=msg; },
  setBuffering(show){ document.getElementById('buffering-indicator').classList.toggle('hidden',!show); },
  setVideoError(show,m){
    document.getElementById('video-error').classList.toggle('hidden',!show);
    if(m)document.getElementById('video-error-msg').textContent=m;
  },

  showOverlay(){
    document.getElementById('video-overlay').classList.remove('hidden');
    document.getElementById('vod-overlay').classList.add('hidden');
    App.overlayVisible=true;
    clearTimeout(App.overlayTimer);
    App.overlayTimer=setTimeout(()=>UI.hideOverlay(),App.OVERLAY_TIMEOUT);
  },
  hideOverlay(){
    document.getElementById('video-overlay').classList.add('hidden');
    document.getElementById('vod-overlay').classList.add('hidden');
    App.overlayVisible=false;
  },
  showVodOverlay(){
    document.getElementById('video-overlay').classList.add('hidden');
    document.getElementById('vod-overlay').classList.remove('hidden');
    App.overlayVisible=true;
    clearTimeout(App.overlayTimer);
    App.overlayTimer=setTimeout(()=>UI.hideOverlay(),App.OVERLAY_TIMEOUT);
  },
  showNextEpisodeOption(next){
    const btn=document.getElementById('btn-next-episode');
    if(!btn) return;
    const ep=next&&next.episode;
    const label=ep&&ep.title ? `Proximo episodio: ${ep.title}` : 'Proximo episodio';
    btn.textContent=label;
    btn.classList.remove('hidden');
  },
  hideNextEpisodeOption(){
    const btn=document.getElementById('btn-next-episode');
    if(btn) btn.classList.add('hidden');
  },

  updateVodProgress(v){
    if(!v||!isFinite(v.duration)||v.duration===0)return;
    const pct=(v.currentTime/v.duration)*100;
    document.getElementById('vod-progress-bar').style.width=pct+'%';
    document.getElementById('vod-progress-cursor').style.left=pct+'%';
    document.getElementById('vod-current-time').textContent=formatTime(v.currentTime);
    document.getElementById('vod-total-time').textContent=formatTime(v.duration);
  },
};

/* ─────────────────────────────────────────────────────────────
   10. NAVEGAÇÃO — BACK BUTTON
   ───────────────────────────────────────────────────────────── */

/* ── Modal de saída nativo (substitui confirm() feio do browser) ── */
const ExitModal = {
  _el: null,

  _build(){
    if(this._el) return;
    const modal = document.createElement('div');
    modal.id = 'exit-modal';
    modal.innerHTML = `
      <div class="exit-modal-backdrop"></div>
      <div class="exit-modal-card">
        <div class="exit-modal-icon">📺</div>
        <div class="exit-modal-title">Fechar o app?</div>
        <div class="exit-modal-sub">Deseja encerrar o IPTVOS?</div>
        <div class="exit-modal-btns">
          <button id="exit-modal-no"  class="exit-modal-btn exit-modal-btn--cancel focusable">Cancelar</button>
          <button id="exit-modal-yes" class="exit-modal-btn exit-modal-btn--confirm focusable">Fechar app</button>
        </div>
      </div>`;
    modal.style.cssText='position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;';
    document.body.appendChild(modal);
    this._el = modal;

    document.getElementById('exit-modal-yes').addEventListener('click', ()=>{ this.hide(); Actions.exitApp(); });
    document.getElementById('exit-modal-no').addEventListener('click',  ()=>{ this.hide(); });

    // Fecha com Back enquanto modal estiver aberto
    modal.addEventListener('keydown', e=>{
      const k = e.keyCode||e.which;
      if(k===13){ // OK no botão focado
        const focused = modal.querySelector('.exit-modal-btn.focused');
        if(focused) focused.click();
      }
      if(k===37||k===39){ // Left/Right troca foco entre botões
        const btns = [...modal.querySelectorAll('.exit-modal-btn')];
        const cur = btns.findIndex(b=>b.classList.contains('focused'));
        btns.forEach(b=>b.classList.remove('focused'));
        const next = btns[(cur+1)%2];
        next.classList.add('focused');
        next.focus({preventScroll:true});
      }
      e.stopPropagation();
    });
  },

  show(){
    this._build();
    this._el.style.display = 'flex';
    this._active = true;
    // Foca no "Cancelar" por padrão (mais seguro)
    const noBtn = document.getElementById('exit-modal-no');
    const yesBtn = document.getElementById('exit-modal-yes');
    if(noBtn&&yesBtn){
      noBtn.classList.add('focused');
      yesBtn.classList.remove('focused');
      noBtn.focus({preventScroll:true});
    }
  },

  hide(){
    if(this._el) this._el.style.display = 'none';
    this._active = false;
  },

  isActive(){ return !!this._active; },
};

/* ─────────────────────────────────────────────────────────────
   10. NAVEGAÇÃO — BACK BUTTON
   ───────────────────────────────────────────────────────────── */

let _currentBackUrl = null;

function tvSetBackUrl(url) {
    _currentBackUrl = url;
}

function tvGoBack(backUrl) {
    const targetUrl = backUrl || _currentBackUrl;
    if (targetUrl) {
        if (targetUrl.startsWith('screen:')) {
            const screen = targetUrl.split(':')[1];
            if(screen === 'home') Actions.backToHome();
            else if(screen === 'vod') Actions.backToVod();
            else UI.showScreen(screen, {skipStack:true});
        } else {
            window.location.href = targetUrl;
        }
    } else {
        // Nenhuma página configurada na raiz
        if (typeof webOS !== 'undefined' && webOS.platformBack) {
            webOS.platformBack();
        } else {
            window.close();
        }
    }
}

// Previne comportamento padrão nativo da página exatamente como no Assist Plus
document.onkeydown = function(e) {};

// Gerenciador hierárquico da tecla Voltar (Arquitetura Assist Plus)
function handleBackAction() {
    // 1. Se modal de saída estiver aberto, fechar e permanecer no app
    if (ExitModal.isActive()) {
        ExitModal.hide();
        return;
    }

    // 2. Se estiver no player de vídeo em tela cheia:
    // Encerra a reprodução e retorna diretamente à lista de origem
    if (App.currentScreen === 'video') {
        Player.stop();
        if (App.playerMode === 'live') {
            Actions.returnToLiveList();
        } else {
            Actions.returnToVodSource();
        }
        return;
    }

    // 3. Se estiver na tela de Canais ao Vivo (Live TV):
    if (App.currentScreen === 'player') {
        if (App.focusZone === 'search') {
            const si = document.getElementById('search-input');
            if (si) si.blur();
            App.focusZone = 'grid';
            Nav.setGridFocus(0);
            return;
        }
        if (App.focusZone === 'grid') {
            // Recua foco da grade de canais (direita) para a coluna de categorias (esquerda)
            App.focusZone = 'sidebar';
            UI.updateLiveCatFocus(App.catFocusIndex);
            UI.updateGridFocus(-1);
            return;
        }
        // Estando nas categorias (ou qualquer outra zona interna), retorna à Home
        Actions.backToHome();
        return;
    }

    // 4. Se estiver na tela de Filmes / Séries (VOD):
    if (App.currentScreen === 'vod') {
        if (App.vodFocusZone === 'search') {
            const vsi = document.getElementById('vod-search-input');
            if (vsi) vsi.blur();
            App.vodFocusZone = 'grid';
            Nav.setVodGridFocus(0);
            return;
        }
        if (App.vodFocusZone === 'grid') {
            // Recua foco dos pôsteres (direita) para a coluna de categorias (esquerda)
            App.vodFocusZone = 'sidebar';
            UI.updateVodCatFocus(App.vodCatFocusIndex);
            UI.updateVodGridFocus(-1);
            return;
        }
        // Estando nas categorias (ou qualquer outra zona interna), retorna à Home
        Actions.backToHome();
        return;
    }

    // 5. Se estiver na tela de Detalhes (Filme / Série):
    if (App.currentScreen === 'detail') {
        const df = App.detailFocus;
        if (df && (df.startsWith('ep-') || df.startsWith('season-'))) {
            // Se estiver navegando em episódios/temporadas, recua foco para os botões do topo
            UI.setDetailFocus('play');
            return;
        }
        // Retorna para a grade VOD
        Actions.backToVod();
        return;
    }

    // 6. Se estiver na tela Home:
    if (App.currentScreen === 'home') {
        if (App.homeFocus >= 3) {
            // Se estiver na linha "Continuar Assistindo", sobe foco para os cards principais
            UI.setHomeFocus(0);
            return;
        }
        // Se já estiver nos cards principais, exibe o modal de confirmação de saída
        ExitModal.show();
        return;
    }

    // 7. Se estiver na tela de Login / Setup:
    if (App.currentScreen === 'setup') {
        ExitModal.show();
        return;
    }

    // Fallback padrão se houver rota configurada
    tvGoBack();
}

// Alias global para navegação de BACK — usado pelos handlers do Nav
function handleBackKey() { handleBackAction(); }

// 1. Único listener global de keydown em window e document, com capture:true
const _onBackKeyDown = function(e) {
    const k = e.keyCode || e.which;
    const isBackKey    = k === 461 || k === 27 || k === 10009 || e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'Back' || e.key === 'GoBack';
    const isBackspace  = k === 8   || e.key === 'Backspace';

    if (!isBackKey && !isBackspace) return;

    // ── CASO ESPECIAL: input/textarea com foco ──────────────────────────────
    // Backspace dentro de um campo de texto deve apagar o caractere normalmente.
    // Somente teclas de BACK reais (461, ESC, BrowserBack) saem do campo.
    const activeEl = document.activeElement;
    const isEditableField = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT'
    );

    if (isEditableField) {
        if (isBackspace) {
            return;
        }
        // ESC / BACK real: sair do campo e restaurar zona de foco
        e.preventDefault();
        e.stopPropagation();
        activeEl.blur();
        if (App.currentScreen === 'player' && App.focusZone === 'search') {
            App.focusZone = 'grid';
            Nav.setGridFocus(0);
        } else if (App.currentScreen === 'vod' && App.vodFocusZone === 'search') {
            App.vodFocusZone = 'grid';
            Nav.setVodGridFocus(0);
        }
        return false;
    }

    // A partir daqui consumimos o evento e executamos a navegação hierárquica
    e.preventDefault();
    e.stopPropagation();

    handleBackAction();
    return false;
};

window.addEventListener('keydown', _onBackKeyDown, { capture: true });
document.addEventListener('keydown', _onBackKeyDown, { capture: true });

const Nav = {
  init(){
    document.addEventListener('keydown',e=>{
      const k=this._keyCode(e);
      if(k===KEYS.HOME){
        e.preventDefault();
        e.stopPropagation();
        Actions.exitApp();
        return;
      }
      if(this._isSearchInput(e.target)){
        App.focusZone=e.target.id==='search-input'?'search':App.focusZone;
        App.vodFocusZone=e.target.id==='vod-search-input'?'search':App.vodFocusZone;
        return;
      }
      if([KEYS.LEFT,KEYS.RIGHT,KEYS.UP,KEYS.DOWN,KEYS.OK,KEYS.HOME].includes(k)) e.preventDefault();
      switch(App.currentScreen){
        case 'setup':  this._login(k);  break;
        case 'home':   this._home(k);   break;
        case 'player': this._live(k);   break;
        case 'vod':    this._vod(k);    break;
        case 'detail': this._detail(k); break;
        case 'video':  this._video(k);  break;
      }
    });
  },

  _keyCode(e){
    if(e.keyCode===36||e.which===36||e.key==='Home'||e.key==='GoHome') return KEYS.HOME;
    // BACK (461) e ESC (27) são tratados pelo listener global com capture:true.
    // Aqui mapeamos apenas para que os handlers do Nav possam reconhecê-los,
    // mas o listener global consome o evento antes de chegarem aqui na maioria dos casos.
    if(e.keyCode===461||e.which===461||e.keyCode===10009||e.key==='Back'||e.key==='BrowserBack'||e.key==='GoBack'||e.key==='Escape') return KEYS.BACK;
    return e.keyCode||e.which||0;
  },

  _isSearchInput(target){
    return target&&target.tagName==='INPUT'&&(target.id==='search-input'||target.id==='vod-search-input');
  },

  _login(k){
    const f=UI.LOGIN_FIELDS; const cur=f.indexOf(App.loginFocus);
    if(k===KEYS.DOWN||k===KEYS.CH_DN){ if(cur<f.length-1)UI.setLoginFocus(f[cur+1]); }
    else if(k===KEYS.UP||k===KEYS.CH_UP){ if(cur>0)UI.setLoginFocus(f[cur-1]); }
    else if((k===KEYS.OK||k===KEYS.GREEN)&&App.loginFocus==='btn-login') Actions.doLogin();
  },

  _home(k){
    const numCards = 3; // Live, Filmes, Séries
    const numContinue = Math.min(6, App.homeContinueItems.length);
    const maxIdx = numCards + numContinue - 1;
    const inCards = App.homeFocus < numCards;
    const inContinue = App.homeFocus >= numCards;

    if(k===KEYS.LEFT){
      UI.setHomeFocus(Math.max(0, App.homeFocus-1));
    } else if(k===KEYS.RIGHT){
      if(inCards)       UI.setHomeFocus(Math.min(numCards-1, App.homeFocus+1));
      else if(inContinue) UI.setHomeFocus(Math.min(maxIdx, App.homeFocus+1));
    } else if(k===KEYS.UP){
      if(inContinue)    UI.setHomeFocus(numCards-1); // volta para linha de cards
      else              UI.setHomeFocus(Math.max(0, App.homeFocus));
    } else if(k===KEYS.DOWN){
      if(inCards && numContinue > 0) UI.setHomeFocus(numCards); // vai para 1º item continuar
      // se já está em continuar ou não há itens: não move
    } else if(k===KEYS.OK||k===KEYS.GREEN){
      if(inCards) Actions.openHomeSection(App.homeFocus);
      else        Actions.openContinueItem(App.homeFocus - numCards);
    }
  },

  _live(k){
    const z=App.focusZone;
    switch(k){
      case KEYS.LEFT:
        if(z==='grid'){ if(App.gridFocusIndex%App.GRID_COLS===0){ App.focusZone='sidebar'; UI.updateLiveCatFocus(App.catFocusIndex); UI.updateGridFocus(-1); } else this.moveGrid(-1); }
        break;
      case KEYS.RIGHT:
        if(z==='sidebar'){ App.focusZone='grid'; UI.updateLiveCatFocus(-1); this.setGridFocus(App.gridFocusIndex); }
        else if(z==='grid') this.moveGrid(1);
        break;
      case KEYS.UP:
        if(z==='grid'){ if(App.gridFocusIndex<App.GRID_COLS){ if(!VirtualGrid.prev())this.moveGrid(-App.GRID_COLS); }else this.moveGrid(-App.GRID_COLS); }
        else if(z==='sidebar') this.moveCat(-1);
        else if(z==='search'){ App.focusZone='grid'; document.getElementById('search-input').blur(); this.setGridFocus(0); }
        break;
      case KEYS.DOWN:
        if(z==='grid'){ const pl=VirtualGrid.getPage().length; if(App.gridFocusIndex+App.GRID_COLS>=pl){ if(!VirtualGrid.next())this.moveGrid(App.GRID_COLS); }else this.moveGrid(App.GRID_COLS); }
        else if(z==='sidebar') this.moveCat(1);
        break;
      case KEYS.OK:
        if(z==='grid')    this.openLiveChannel(App.gridFocusIndex);
        if(z==='sidebar'){ this.selectLiveCat(App.catFocusIndex); App.focusZone='grid'; this.setGridFocus(0); }
        if(z==='search'){ App.focusZone='grid'; document.getElementById('search-input').blur(); this.setGridFocus(0); }
        break;
      case KEYS.YELLOW:
        if(z==='grid'){ const ch=App.filteredChannels[VirtualGrid.localToGlobal(App.gridFocusIndex)]; if(ch)Favorites.toggle(ch); }
        break;
      case KEYS.BACK: handleBackKey(); break;
      case KEYS.RED:  document.getElementById('search-input').focus(); App.focusZone='search'; break;
      case KEYS.BLUE:{ const fi=App.liveCategories.indexOf('★ Favoritos'); if(fi!==-1){ this.selectLiveCat(fi); App.focusZone='grid'; this.setGridFocus(0); } break; }
    }
  },

  _vod(k){
    const z=App.vodFocusZone;
    switch(k){
      case KEYS.LEFT:
        if(z==='grid'){ if(App.vodGridFocusIndex%App.VOD_COLS===0){ App.vodFocusZone='sidebar'; UI.updateVodCatFocus(App.vodCatFocusIndex); UI.updateVodGridFocus(-1); } else this.moveVodGrid(-1); }
        break;
      case KEYS.RIGHT:
        if(z==='sidebar'){ App.vodFocusZone='grid'; UI.updateVodCatFocus(-1); this.setVodGridFocus(App.vodGridFocusIndex); }
        else if(z==='grid') this.moveVodGrid(1);
        break;
      case KEYS.UP:
        if(z==='grid'){ if(App.vodGridFocusIndex<App.VOD_COLS){ if(!VodGrid.prev())this.moveVodGrid(-App.VOD_COLS); }else this.moveVodGrid(-App.VOD_COLS); }
        else if(z==='sidebar') this.moveVodCat(-1);
        else if(z==='search'){ App.vodFocusZone='grid'; document.getElementById('vod-search-input').blur(); this.setVodGridFocus(0); }
        break;
      case KEYS.DOWN:
        if(z==='grid'){ const pl=VodGrid.getPage().length; if(App.vodGridFocusIndex+App.VOD_COLS>=pl){ if(!VodGrid.next())this.moveVodGrid(App.VOD_COLS); }else this.moveVodGrid(App.VOD_COLS); }
        else if(z==='sidebar') this.moveVodCat(1);
        break;
      case KEYS.OK:
        if(z==='grid')    this.openVodDetail(App.vodGridFocusIndex);
        if(z==='sidebar'){ this.selectVodCat(App.vodCatFocusIndex); App.vodFocusZone='grid'; this.setVodGridFocus(0); }
        if(z==='search'){ App.vodFocusZone='grid'; document.getElementById('vod-search-input').blur(); this.setVodGridFocus(0); }
        break;
      case KEYS.BACK: handleBackKey(); break;
      case KEYS.YELLOW:
        if(z==='grid'){ const item=App.filteredVod[VodGrid.localToGlobal(App.vodGridFocusIndex)]; if(item)Favorites.toggleFavorite(item.type||App.vodMode,item); }
        break;
      case KEYS.RED:  document.getElementById('vod-search-input').focus(); App.vodFocusZone='search'; break;
    }
  },

  _detail(k){
    const df=App.detailFocus;
    const isMovie=App.currentDetail&&App.currentDetail.type==='movie';
    const seasons=[...document.querySelectorAll('.season-btn')];
    const eps=[...document.querySelectorAll('.episode-item')];

    switch(k){
      case KEYS.BACK: handleBackKey(); break;
      case KEYS.YELLOW:
        if(App.currentDetail) Favorites.toggleFavorite(App.currentDetail.type, App.currentDetail);
        break;
      case KEYS.OK:
      case KEYS.GREEN:
        if(df==='play'){ Actions.playVodItem(App.currentDetail, App.currentDetail.name); }
        else if(df==='sub'){ Actions.addSubtitleToCurrentContent(); }
        else if(df==='back'){ Actions.backToVod(); }
        else if(df&&df.startsWith('season-')){
          const idx=parseInt(df.split('-')[1]);
          if(seasons[idx]){ const sn=seasons[idx].dataset.season; UI._selectSeason(sn); UI.setDetailFocus('ep-0'); }
        }
        else if(df&&df.startsWith('ep-')){
          const idx=parseInt(df.split('-')[1]);
          if(eps[idx]){ eps[idx].click(); }
        }
        break;
      case KEYS.UP:
        if(df==='back'){ UI.setDetailFocus('sub'); }
        else if(df==='sub'){ UI.setDetailFocus(isMovie?'play':'ep-0'); }
        else if(df==='play'){ UI.setDetailFocus('back'); }
        else if(df&&df.startsWith('ep-')){
          const idx=parseInt(df.split('-')[1]);
          if(idx>0) UI.setDetailFocus(`ep-${idx-1}`);
          else UI.setDetailFocus('season-0');
        }
        else if(df&&df.startsWith('season-')){ UI.setDetailFocus('back'); }
        break;
      case KEYS.DOWN:
        if(df==='play'){ UI.setDetailFocus('sub'); }
        else if(df==='sub'){ UI.setDetailFocus('back'); }
        else if(df==='back'){ UI.setDetailFocus(isMovie?'play':(seasons.length?'season-0':'sub')); }
        else if(df&&df.startsWith('season-')){ if(eps.length)UI.setDetailFocus('ep-0'); }
        else if(df&&df.startsWith('ep-')){
          const idx=parseInt(df.split('-')[1]);
          if(idx<eps.length-1) UI.setDetailFocus(`ep-${idx+1}`);
          else UI.setDetailFocus('sub');
        }
        break;
      case KEYS.BLUE:
        Actions.addSubtitleToCurrentContent();
        break;
      case KEYS.LEFT:
        if(df&&df.startsWith('season-')){
          const idx=parseInt(df.split('-')[1]);
          if(idx>0) UI.setDetailFocus(`season-${idx-1}`);
        }
        break;
      case KEYS.RIGHT:
        if(df&&df.startsWith('season-')){
          const idx=parseInt(df.split('-')[1]);
          if(idx<seasons.length-1) UI.setDetailFocus(`season-${idx+1}`);
        }
        break;
    }
  },

  _video(k){
    if(!App.overlayVisible){
      if(App.playerMode==='live') UI.showOverlay(); else UI.showVodOverlay();
      return;
    }
    switch(k){
      case KEYS.BACK:
      case KEYS.EXIT:
        if(App.playerMode==='live') Actions.exitLivePlayer();
        else Actions.exitVodPlayer();
        break;
      case KEYS.OK:
      case KEYS.PLAY:
      case KEYS.PAUSE:{
        const v=document.getElementById('video-player');
        if(v.paused){ v.play(); UI.setStatus('▶ Reproduzindo'); document.getElementById('vod-playback-status').textContent='▶ Reproduzindo'; }
        else{ v.pause(); UI.setStatus('⏸ Pausado'); document.getElementById('vod-playback-status').textContent='⏸ Pausado'; }
        if(App.playerMode==='live') UI.showOverlay(); else UI.showVodOverlay();
        break;
      }
      case KEYS.RIGHT:
        if(App.playerMode==='live'){ Player.next(); UI.showOverlay(); }
        else{ Player.seek(10); }
        break;
      case KEYS.LEFT:
        if(App.playerMode==='live'){ Player.prev(); UI.showOverlay(); }
        else{ Player.seek(-10); }
        break;
      case KEYS.CH_UP:
        if(App.playerMode==='live'){ Player.next(); UI.showOverlay(); }
        else{ Player.seek(60); }
        break;
      case KEYS.CH_DN:
        if(App.playerMode==='live'){ Player.prev(); UI.showOverlay(); }
        else{ Player.seek(-60); }
        break;
      case KEYS.RED:   if(App.playerMode==='vod') Player.seek(-60); break;
      case KEYS.GREEN: if(App.playerMode==='vod') Player.seek(60);  break;
      case KEYS.BLUE:
        if(App.playerMode==='vod') Actions.addSubtitleToCurrentContent();
        break;
      case KEYS.YELLOW:
        if(App.playerMode==='live'){
          const ch=App.filteredChannels[App.currentChannelIndex];
          if(ch){ Favorites.toggle(ch); UI.showOverlay(); }
        }else if(App.nextEpisodeTarget){
          Actions.playNextEpisode();
        }
        break;
    }
  },

  /* Live helpers */
  moveGrid(d){ const max=VirtualGrid.getPage().length-1; if(max<0)return; this.setGridFocus(Math.max(0,Math.min(App.gridFocusIndex+d,max))); },
  setGridFocus(i){ App.gridFocusIndex=i; UI.updateGridFocus(i); },
  moveCat(d){ App.catFocusIndex=Math.max(0,Math.min(App.catFocusIndex+d,App.liveCategories.length-1)); UI.updateLiveCatFocus(App.catFocusIndex); },
  selectLiveCat(idx,rerender=true){
    const cat=App.liveCategories[idx];
    App.currentCategory=cat; App.catFocusIndex=idx; App.gridFocusIndex=0;
    Storage.saveCat(cat); UI.updateLiveCatHL(idx); UI.updateLiveCatTitle(cat);
    if(rerender) Actions.applyLiveFilters();
  },
  openLiveChannel(li){
    const gi=VirtualGrid.localToGlobal(li);
    App.currentChannelIndex=gi;
    const ch=App.filteredChannels[gi]; if(!ch)return;
    UI.showScreen('video'); Player.play(ch); UI.showOverlay();
  },

  /* VOD helpers */
  moveVodGrid(d){ const max=VodGrid.getPage().length-1; if(max<0)return; this.setVodGridFocus(Math.max(0,Math.min(App.vodGridFocusIndex+d,max))); },
  setVodGridFocus(i){ App.vodGridFocusIndex=i; UI.updateVodGridFocus(i); },
  moveVodCat(d){ App.vodCatFocusIndex=Math.max(0,Math.min(App.vodCatFocusIndex+d,App.vodCategories.length-1)); UI.updateVodCatFocus(App.vodCatFocusIndex); },
  selectVodCat(idx,rerender=true){
    const cat=App.vodCategories[idx];
    App.vodCurrentCategory=cat; App.vodCatFocusIndex=idx; App.vodGridFocusIndex=0;
    UI.updateVodCatHL(idx); UI.updateVodCatTitle(cat);
    if(rerender) Actions.applyVodFilters();
  },
  openVodDetail(li){
    const gi=VodGrid.localToGlobal(li);
    const item=App.filteredVod[gi]; if(!item)return;
    UI.showScreen('detail');
    UI.showDetail(item);
  },
};

/* ─────────────────────────────────────────────────────────────
   11. AÇÕES
   ───────────────────────────────────────────────────────────── */
const Actions = {

  async doLogin(){
    const rawHost=document.getElementById('xt-host').value.trim();
    const user=document.getElementById('xt-user').value.trim();
    const pass=document.getElementById('xt-pass').value.trim();
    if(!rawHost) return UI.setSetupStatus('⚠ Insira o endereço do servidor.','error');
    if(!user)    return UI.setSetupStatus('⚠ Insira o usuário.','error');
    if(!pass)    return UI.setSetupStatus('⚠ Insira a senha.','error');

    const host=XtreamAPI.normalize(rawHost);
    App.xtHost=host; App.xtUser=user; App.xtPass=pass;

    UI.hideSetupStatus(); UI.setLoginLoading(true);
    UI.showParsing(true,'Conectando ao servidor Xtream...');
    await new Promise(r=>setTimeout(r,150));

    try{
      const [streams,cats]=await Promise.all([XtreamAPI.getLive(), XtreamAPI.getLiveCats()]);
      if(!streams.length) throw new Error('Nenhum canal ao vivo encontrado.');
      const catMap=Parser.buildCatMap(cats);
      App.allChannels=Parser.parseLive(streams,catMap);
      App.liveCategories=Parser.catList(App.allChannels,Favorites.count('channels'));
      App.filteredChannels=[...App.allChannels];
      VirtualGrid.reset();

      Storage.saveCreds(host,user,pass);
      UI.showParsing(false); UI.setLoginLoading(false);

      // Vai para a Home
      UI.showScreen('home',{resetStack:true});
      UI.setHomeFocus(0);
      initAllClocks();

    }catch(err){
      console.error('[doLogin]',err);
      UI.showParsing(false); UI.setLoginLoading(false);
      UI.setSetupStatus(`❌ ${err.message}`,'error');
    }
  },

  async openHomeSection(idx){
    const types=['live','movies','series'];
    const type=types[idx];

    if(type==='live'){
      UI.renderLiveCats(App.liveCategories);
      const savedCat=Storage.getCat();
      const savedIdx=App.liveCategories.indexOf(savedCat);
      const defIdx=Favorites.count('channels')?1:0;
      Nav.selectLiveCat(savedIdx!==-1?savedIdx:defIdx);
      UI.showScreen('player');
      App.focusZone='grid'; Nav.setGridFocus(0);

    } else if(type==='movies'){
      App.vodMode='movies';
      document.getElementById('vod-sidebar-logo').textContent='Filmes';
      UI.showParsing(true,'Carregando filmes...');
      try{
        const [movies,cats]=await Promise.all([XtreamAPI.getMovies(), XtreamAPI.getMovieCats()]);
        const catMap=Parser.buildCatMap(cats);
        App.allVod=Parser.parseMovies(movies,catMap);
        App.vodCategories=Parser.catList(App.allVod,Favorites.count('movies'));
        App.filteredVod=[...App.allVod];
        VodGrid.reset();
        UI.showParsing(false);
        UI.renderVodCats(App.vodCategories);
        Nav.selectVodCat(0);
        UI.showScreen('vod');
        App.vodFocusZone='grid'; Nav.setVodGridFocus(0);
      }catch(e){ UI.showParsing(false); alert('Erro ao carregar filmes: '+e.message); }

    } else {
      App.vodMode='series';
      document.getElementById('vod-sidebar-logo').textContent='Séries';
      UI.showParsing(true,'Carregando séries...');
      try{
        const [series,cats]=await Promise.all([XtreamAPI.getSeries(), XtreamAPI.getSeriesCats()]);
        const catMap=Parser.buildCatMap(cats);
        App.allVod=Parser.parseSeries(series,catMap);
        App.vodCategories=Parser.catList(App.allVod,Favorites.count('series'));
        App.filteredVod=[...App.allVod];
        VodGrid.reset();
        UI.showParsing(false);
        UI.renderVodCats(App.vodCategories);
        Nav.selectVodCat(0);
        UI.showScreen('vod');
        App.vodFocusZone='grid'; Nav.setVodGridFocus(0);
      }catch(e){ UI.showParsing(false); alert('Erro ao carregar séries: '+e.message); }
    }
  },

  applyLiveFilters(q=''){
    const cat=App.currentCategory; const term=q.toLowerCase().trim();
    let base;
    if(cat==='★ Favoritos')  base=Favorites.getChannels();
    else if(cat==='Todos')    base=[...App.allChannels];
    else                      base=App.allChannels.filter(c=>c.group===cat);
    if(/Favoritos/.test(cat)) base=Favorites.getChannels();
    App.filteredChannels=term?base.filter(c=>c.name.toLowerCase().includes(term)||c.group.toLowerCase().includes(term)):base;
    VirtualGrid.reset(); UI.renderLiveGrid();
  },

  applyVodFilters(q=''){
    const cat=App.vodCurrentCategory; const term=q.toLowerCase().trim();
    let base=cat==='Todos'?[...App.allVod]:App.allVod.filter(c=>c.group===cat);
    if(/Favoritos/.test(cat)) base=Favorites.getVod(App.vodMode);
    App.filteredVod=term?base.filter(c=>c.name.toLowerCase().includes(term)):base;
    VodGrid.reset(); UI.renderVodGrid();
  },

  playVodItem(item, label=''){
    if(App.currentScreen!=='video'){
      App.videoReturnScreen=App.currentScreen==='home'?'home':(App.currentScreen==='detail'?'detail':'vod');
    }
    UI.showScreen('video');
    Player.playVod(item, label);
    UI.showVodOverlay();
  },

  playNextEpisode(){
    const current=App.currentVodItem;
    if(!current||current.mediaType!=='episode') return;
    const data=current.episodeData||current;
    const next=App.nextEpisodeTarget||ContinueWatching.getNextEpisode((current.seriesData||App.currentDetail||{}).id, data.seasonNumber, data.episodeNumber);
    if(!next||!next.episode){
      UI.hideNextEpisodeOption();
      const status=document.getElementById('vod-playback-status');
      if(status) status.textContent='Nao ha proximo episodio.';
      return;
    }
    ContinueWatching.saveCurrentVideo();
    App.nextEpisodeTarget=null;
    App.nextEpisodePromptShown=false;
    UI.hideNextEpisodeOption();
    App.currentSeason=String(next.seasonNumber);
    const ep=next.episode;
    const ext=ep.container_extension||'mp4';
    const url=XtreamAPI.seriesEpUrl(App.xtHost,App.xtUser,App.xtPass,ep.id,ext);
    UI._playEpisode(url, ep.title||`Episodio ${next.episodeNumber}`, 0);
  },

  addSubtitleToCurrentContent(){
    const current=App.currentScreen==='video' ? App.currentVodItem : App.currentDetail;
    if(!current){
      alert('Abra um filme, serie ou episodio antes de adicionar legenda.');
      return;
    }
    const existing=getSubtitleUrl(current);
    const url=(prompt('URL da legenda (.vtt ou .srt):', existing)||'').trim();
    if(!url) return;
    if(!/\.srt($|\?|\#)|\.vtt($|\?|\#)/i.test(url)){
      alert('Use uma URL de legenda .srt ou .vtt.');
      return;
    }
    current.subtitle=url;
    current.subtitleUrl=url;
    current.subtitles_url=url;
    if(App.currentDetail&&current!==App.currentDetail&&String(current.id||'')===String(App.currentDetail.id||'')){
      App.currentDetail.subtitle=url;
      App.currentDetail.subtitleUrl=url;
    }
    if(App.currentScreen==='video'&&App.playerMode==='vod'){
      App.currentVodItem=current;
      Player.setSubtitles(url);
      const status=document.getElementById('vod-playback-status');
      if(status) status.textContent='Legenda carregada';
      UI.showVodOverlay();
    }else{
      alert('Legenda adicionada. Ao reproduzir este conteudo, ela sera carregada automaticamente.');
      forceFocus('screen-detail');
    }
  },

  async openContinueItem(idx){
    const saved=App.homeContinueItems[idx];
    if(!saved) return;
    UI.showParsing(true,'Abrindo episodio...');
    try{
      const info=await XtreamAPI.getSeriesInfo(saved.seriesId);
      App.currentDetail={id:saved.seriesId,name:saved.seriesName,logo:saved.thumbnail,type:'series'};
      App.seasonEpisodes=info.episodes||{};
      App.currentSeason=String(saved.seasonNumber||Object.keys(App.seasonEpisodes)[0]||'1');
      let target=null;
      if(saved.completed) target=ContinueWatching.getNextEpisode(saved.seriesId,saved.seasonNumber,saved.episodeNumber);
      let ep, seasonNumber, startTime=0;
      if(target){
        ep=target.episode; seasonNumber=target.seasonNumber;
      }else{
        seasonNumber=saved.seasonNumber;
        ep=(App.seasonEpisodes[String(seasonNumber)]||[]).find(e=>String(e.id)===String(saved.episodeId));
        startTime=saved.currentTime||0;
      }
      if(!ep) throw new Error('Episodio nao encontrado.');
      App.currentSeason=String(seasonNumber);
      const ext=ep.container_extension||'mp4';
      const url=XtreamAPI.seriesEpUrl(App.xtHost,App.xtUser,App.xtPass,ep.id,ext);
      UI.showParsing(false);
      UI._playEpisode(url, ep.title||saved.episodeName, startTime);
    }catch(e){
      UI.showParsing(false);
      alert('Erro ao continuar episodio: '+e.message);
    }
  },

  exitLivePlayer(){
    Player.stop();
    this.returnToLiveList();
  },

  returnToLiveList(){
    UI.showScreen('player',{skipStack:true});
    App.focusZone='grid';
    Nav.setGridFocus(VirtualGrid.globalToLocal(App.currentChannelIndex));
  },

  exitVodPlayer(){
    Player.stop();
    this.returnToVodSource();
  },

  returnToVodSource(){
    if(App.videoReturnScreen==='home'){
      UI.showScreen('home',{skipStack:true});
      UI.setHomeFocus(0);
    } else if(App.currentDetail&&App.currentDetail.type==='series'){
      UI.showScreen('detail',{skipStack:true});
      UI.setDetailFocus(App.detailFocus||'back');
    } else {
      UI.showScreen('vod',{skipStack:true});
      App.vodFocusZone='grid'; Nav.setVodGridFocus(0);
    }
  },

  backToHome(){
    Player.stop();
    UI.showScreen('home',{skipStack:true});
    UI.setHomeFocus(0);
  },

  confirmExitOrLogout(){
    if(confirm('Sair da conta?')) this.backToLogin();
  },

  confirmExitApp(){
    ExitModal.show();
  },

  exitApp(){
    try{
      if(typeof webOS!=='undefined'&&webOS.platformBack){
        webOS.platformBack();
        return;
      }
    }catch(e){ console.warn('[exitApp]', e); }
    window.close();
  },

  backToLogin(){
    Player.stop();
    UI.showScreen('setup',{resetStack:true});
    UI.hideSetupStatus();
    UI.setLoginFocus('btn-login');
  },

  backToVod(){
    UI.showScreen('vod',{skipStack:true});
    App.vodFocusZone='grid'; Nav.setVodGridFocus(0);
  },
};

/* ─────────────────────────────────────────────────────────────
   12. BUSCA COM DEBOUNCE
   ───────────────────────────────────────────────────────────── */
function initSearch(){
  const si=document.getElementById('search-input');
  let t;
  si.addEventListener('input',()=>{ clearTimeout(t); t=setTimeout(()=>Actions.applyLiveFilters(si.value),250); });
  si.addEventListener('focus',()=>{ App.focusZone='search'; });

  const vs=document.getElementById('vod-search-input');
  let tv;
  vs.addEventListener('input',()=>{ clearTimeout(tv); tv=setTimeout(()=>Actions.applyVodFilters(vs.value),250); });
  vs.addEventListener('focus',()=>{ App.vodFocusZone='search'; });
}

/* ─────────────────────────────────────────────────────────────
   13. RELÓGIOS
   ───────────────────────────────────────────────────────────── */
function initAllClocks(){
  const ids=['clock','home-clock','vod-clock'];
  const tick=()=>{
    const n=new Date();
    const str=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
    ids.forEach(id=>{ const el=document.getElementById(id); if(el)el.textContent=str; });
  };
  tick(); setInterval(tick,1000);
}

/* ─────────────────────────────────────────────────────────────
   14. LISTENERS
   ───────────────────────────────────────────────────────────── */
function initButtons(){
  document.getElementById('btn-login').addEventListener('click',()=>Actions.doLogin());
  document.getElementById('btn-back-live').addEventListener('click',()=>Actions.backToHome());
  document.getElementById('btn-back-vod').addEventListener('click',()=>Actions.backToHome());
  document.getElementById('btn-exit-player').addEventListener('click',()=>Actions.exitLivePlayer());
  document.getElementById('btn-exit-vod-player').addEventListener('click',()=>Actions.exitVodPlayer());
  document.getElementById('btn-back-detail').addEventListener('click',()=>Actions.backToVod());
  document.getElementById('btn-fav-detail').addEventListener('click',()=>{ if(App.currentDetail)Favorites.toggleFavorite(App.currentDetail.type,App.currentDetail); });
  document.getElementById('btn-add-sub-detail').addEventListener('click',()=>Actions.addSubtitleToCurrentContent());
  document.getElementById('btn-add-sub-vod').addEventListener('click',()=>Actions.addSubtitleToCurrentContent());
  document.getElementById('btn-next-episode').addEventListener('click',()=>Actions.playNextEpisode());
  document.getElementById('btn-play-vod').addEventListener('click',()=>{ if(App.currentDetail)Actions.playVodItem(App.currentDetail,App.currentDetail.name); });
  document.getElementById('btn-retry').addEventListener('click',()=>{
    if(App.playerMode==='live'){ const ch=App.filteredChannels[App.currentChannelIndex]; if(ch)Player.play(ch); }
    else if(App.currentVodItem) Player.playVod(App.currentVodItem);
  });

  ['xt-host','xt-user','xt-pass'].forEach(id=>{
    document.getElementById(id).addEventListener('keydown',e=>{ if(e.key==='Enter')Actions.doLogin(); });
    document.getElementById(id).addEventListener('focus',()=>{ App.loginFocus=id; });
  });

  document.querySelectorAll('.home-card').forEach(card=>{
    card.addEventListener('click',()=>Actions.openHomeSection(parseInt(card.dataset.index)));
  });
}

/* ─────────────────────────────────────────────────────────────
   15. AUTO-LOGIN
   ───────────────────────────────────────────────────────────── */
async function tryAutoLogin(){
  const {host,user,pass}=Storage.getCreds();
  if(!host||!user||!pass)return;
  document.getElementById('xt-host').value=host;
  document.getElementById('xt-user').value=user;
  document.getElementById('xt-pass').value=pass;
  UI.setSetupStatus('🔄 Entrando com credenciais salvas...','info');
  await new Promise(r=>setTimeout(r,600));
  await Actions.doLogin();
}

/* ─────────────────────────────────────────────────────────────
   16. UTILITÁRIOS
   ───────────────────────────────────────────────────────────── */
function escHtml(str){
  const d=document.createElement('div'); d.textContent=str; return d.innerHTML;
}
function formatTime(s){
  if(!isFinite(s)||s<0)return'0:00:00';
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=Math.floor(s%60);
  return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

/* ─────────────────────────────────────────────────────────────
   17. BOOT
   ───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded',async()=>{
  console.log('[IPTVOS v4.0] Boot');
  if(typeof webOS!=='undefined') webOS.deviceInfo(i=>console.log('[WebOS]',i));

  Favorites.init();
  ContinueWatching.init();
  Player.init();
  Nav.init();
  initAllClocks();
  initSearch();
  initButtons();
  UI.setLoginFocus('xt-host');

  await tryAutoLogin();
});
