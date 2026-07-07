import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { MessageCircle, Send, Globe, MapPin, LayoutDashboard, User, Activity, Megaphone, Map, AlertTriangle, Volume2, Languages, RefreshCw, Clock, BookOpen, Search } from 'lucide-react';

const SUPPORTED_LANGUAGES = [
  { name: 'English', code: 'en-US' }, { name: 'Hindi', code: 'hi-IN' }, { name: 'Tamil', code: 'ta-IN' }, { name: 'Telugu', code: 'te-IN' }, { name: 'Malayalam', code: 'ml-IN' }, { name: 'Spanish', code: 'es-ES' }, { name: 'French', code: 'fr-FR' }, { name: 'German', code: 'de-DE' }, { name: 'Japanese', code: 'ja-JP' }, { name: 'Korean', code: 'ko-KR' }
];

// --- LIVE BACKEND URL ---
const API_URL = "https://stadiumopsai.onrender.com";

function App() {
  const [currentView, setCurrentView] = useState('fan'); 
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);

  // Fan States
  const [messages, setMessages] = useState([{ role: 'assistant', content: 'Welcome! Ask me anything, or use the Smart Router below.' }]);
  const [input, setInput] = useState('');
  const [fanLang, setFanLang] = useState('English');
  const [location, setLocation] = useState('Gate 1');
  const [destination, setDestination] = useState('Section 204');
  const [routeAdvice, setRouteAdvice] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Ops States
  const [dashboardData, setDashboardData] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [forecastTime, setForecastTime] = useState(0); 
  
  const [draftMsg, setDraftMsg] = useState('');
  const [targetLang, setTargetLang] = useState('Spanish');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  // SOP Oracle States
  const [oracleInput, setOracleInput] = useState('');
  const [oracleAnswer, setOracleAnswer] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);

  // EFFICIENCY: Use useCallback for handlers
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    const loadVoices = () => setAvailableVoices(window.speechSynthesis.getVoices());
    loadVoices(); 
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const fetchDashboardMetrics = useCallback(async (minutes) => {
    try {
      setDashLoading(true);
      const res = await axios.get(`${API_URL}/api/dashboard?minutes=${minutes}`);
      setDashboardData(res.data);
      setActiveAnnouncement(res.data.active_announcement);
    } catch (err) { console.error(err); } finally { setDashLoading(false); }
  }, []);

  useEffect(() => {
    let interval;
    if (currentView === 'fan') {
      const fetchState = async () => {
        try {
          const res = await axios.get(`${API_URL}/api/state`);
          setActiveAnnouncement(res.data.announcement);
        } catch (err) { }
      };
      fetchState();
      interval = setInterval(fetchState, 3000); 
    } else {
      fetchDashboardMetrics(forecastTime);
    }
    return () => clearInterval(interval);
  }, [currentView, forecastTime, fetchDashboardMetrics]);

  const playAudio = useCallback((text, langName) => {
    if (!window.speechSynthesis) return;
    const targetLangCode = SUPPORTED_LANGUAGES.find(l => l.name === langName)?.code || 'en-US';
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = targetLangCode;
    utterance.rate = 0.9; 
    
    if (availableVoices.length > 0) {
      let matchedVoice = availableVoices.find(v => v.lang === targetLangCode || v.lang.replace('_', '-') === targetLangCode) 
                        || availableVoices.find(v => v.lang.startsWith(targetLangCode.split('-')[0]));
      if (matchedVoice) utterance.voice = matchedVoice;
    }
    window.speechSynthesis.speak(utterance);
  }, [availableVoices]);

  const handleTranslate = async () => {
    if (!draftMsg) return;
    setIsTranslating(true);
    try {
      const res = await axios.post(`${API_URL}/api/translate`, { text: draftMsg, target_language: targetLang });
      setTranslatedText(res.data.translated_text);
    } catch (err) { setTranslatedText("Translation failed."); } 
    finally { setIsTranslating(false); }
  };

  const handleBroadcast = async () => {
    const textToPush = translatedText || draftMsg;
    if (!textToPush) return;
    try {
      await axios.post(`${API_URL}/api/announcement`, { message: textToPush, severity: 'warning' });
      setDraftMsg(''); setTranslatedText(''); fetchDashboardMetrics(forecastTime);
    } catch (err) { }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!input.trim() || chatLoading) return;
    const userMessage = input;
    setInput(''); setMessages((prev) => [...prev, { role: 'user', content: userMessage }]); setChatLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/chat`, { message: userMessage, language: fanLang, user_location: location });
      setMessages((prev) => [...prev, { role: 'assistant', content: response.data.reply }]);
    } catch (error) { 
      setMessages((prev) => [...prev, { role: 'assistant', content: "Connection failure. Please try again." }]);
    } finally { setChatLoading(false); }
  };

  const handleGetRoute = async () => {
    setRouteLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/route`, { start: location, destination: destination, language: fanLang });
      setRouteAdvice(res.data.route_advice);
    } catch (err) { setRouteAdvice("Error calculating route."); } finally { setRouteLoading(false); }
  };

  const handleOracleQuery = async (e) => {
    e.preventDefault();
    if (!oracleInput.trim() || oracleLoading) return;
    setOracleLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/oracle`, { query: oracleInput });
      setOracleAnswer(res.data.answer);
    } catch (error) { setOracleAnswer("Error connecting to SOP database."); } 
    finally { setOracleLoading(false); }
  };

  const getHeatmapColor = (density) => {
    if (density >= 85) return 'bg-red-500/20 border-red-500 text-red-300';
    if (density >= 60) return 'bg-amber-500/20 border-amber-500 text-amber-300';
    return 'bg-emerald-500/20 border-emerald-500 text-emerald-300';
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans">
      
      {/* ACCESSIBILITY: Semantic <header> */}
      <header role="banner" className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-full text-white"><MessageCircle size={24} aria-hidden="true" /></div>
          <div><h1 className="text-xl font-bold tracking-wide">StadiumOps AI</h1></div>
        </div>
        <nav aria-label="Main Navigation" className="flex bg-slate-900 p-1 rounded-xl border border-slate-700">
          <button aria-pressed={currentView === 'fan'} onClick={() => setCurrentView('fan')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${currentView === 'fan' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}><User size={16} aria-hidden="true"/> Fan View</button>
          <button aria-pressed={currentView === 'ops'} onClick={() => setCurrentView('ops')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${currentView === 'ops' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}><LayoutDashboard size={16} aria-hidden="true"/> Ops View</button>
        </nav>
      </header>

      {/* ACCESSIBILITY: aria-live="assertive" forces screen readers to read alerts immediately */}
      {activeAnnouncement && (
        <div role="alert" aria-live="assertive" aria-atomic="true" className={`w-full py-3 px-6 flex items-center justify-between shadow-md animate-pulse ${activeAnnouncement.severity === 'critical' ? 'bg-red-600 text-white' : 'bg-amber-500 text-black'}`}>
          <div className="flex items-center gap-3 font-semibold text-sm">
            <AlertTriangle size={18} aria-hidden="true" /><span>STADIUM ALERT: {activeAnnouncement.message}</span>
          </div>
          <button aria-label="Listen to Alert" onClick={() => playAudio(activeAnnouncement.message, 'English')} className="p-2 bg-black/20 hover:bg-black/40 rounded-full transition-colors cursor-pointer"><Volume2 size={16} aria-hidden="true"/></button>
        </div>
      )}

      {currentView === 'fan' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          
          <section aria-label="Route Finder" className="bg-slate-800 px-6 py-4 border-b border-slate-700">
            <div className="max-w-4xl mx-auto">
              <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2"><Map size={16} aria-hidden="true"/> Crowd-Aware Route Finder</h3>
              <div className="flex flex-wrap gap-3 items-center">
                
                <select aria-label="Starting Location" value={location} onChange={(e) => setLocation(e.target.value)} className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white flex-1 cursor-pointer">
                  <option value="Gate 1">Gate 1</option><option value="Gate 2">Gate 2</option><option value="Gate 3">Gate 3</option>
                </select>
                <span aria-hidden="true" className="text-slate-500">→</span>
                <select aria-label="Destination" value={destination} onChange={(e) => setDestination(e.target.value)} className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white flex-1 cursor-pointer">
                  <option value="Section 204">Section 204</option><option value="Gate 4">Gate 4</option><option value="Food Court B">Food Court B</option>
                </select>
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 flex-1">
                   <Globe size={16} className="text-blue-400" aria-hidden="true" />
                   <select aria-label="Language Selection" value={fanLang} onChange={(e) => setFanLang(e.target.value)} className="bg-transparent text-sm text-white focus:outline-none w-full cursor-pointer">
                     {SUPPORTED_LANGUAGES.map(l => <option key={l.name} value={l.name} className="bg-slate-800">{l.name}</option>)}
                   </select>
                </div>
                <button onClick={handleGetRoute} disabled={routeLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer focus:ring-2 focus:ring-emerald-400 focus:outline-none">
                  {routeLoading ? 'Routing...' : 'Find Route'}
                </button>
              </div>
              
              {routeAdvice && (
                <div aria-live="polite" className="mt-4 p-3 bg-emerald-900/30 border border-emerald-500/50 rounded-lg text-emerald-200 text-sm flex justify-between items-start gap-4">
                  <p>{routeAdvice}</p>
                  <button aria-label="Listen to Route" onClick={() => playAudio(routeAdvice, fanLang)} className="text-emerald-400 mt-0.5 cursor-pointer focus:ring-2 focus:ring-emerald-400 rounded"><Volume2 size={16} aria-hidden="true" /></button>
                </div>
              )}
            </div>
          </section>

          <main aria-label="AI Chat Concierge" aria-live="polite" className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl mx-auto w-full">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] p-4 rounded-3xl whitespace-pre-wrap flex flex-col gap-2 shadow-md ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-100 rounded-bl-sm border border-slate-700'}`}>
                  <span>{msg.content}</span>
                  {msg.role === 'assistant' && (
                    <button aria-label="Listen to Message" onClick={() => playAudio(msg.content, fanLang)} className="self-end text-slate-400 hover:text-blue-400 mt-1 cursor-pointer"><Volume2 size={16} aria-hidden="true" /></button>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </main>

          <footer className="p-4 bg-slate-800 border-t border-slate-700">
            <form onSubmit={handleSendChat} className="max-w-4xl mx-auto flex gap-3">
              <input aria-label="Chat Input" type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Ask your AI Concierge...`} className="flex-1 bg-slate-900 border border-slate-700 rounded-full px-5 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              <button aria-label="Send Message" type="submit" disabled={chatLoading || !input.trim()} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-3 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400"><Send size={18} aria-hidden="true" /></button>
            </form>
          </footer>
        </div>
      ) : (
        /* Ops Dashboard */
        <main aria-label="Operations Command Dashboard" className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="lg:col-span-2 space-y-6">
              
              <section aria-label="Density Heatmap" className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-md">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">Crowd Density Matrix</h2>
                  
                  <div role="group" aria-label="Time Forecast Controls" className="flex bg-slate-900 rounded-lg p-1 border border-slate-600">
                    <button aria-pressed={forecastTime === 0} onClick={() => setForecastTime(0)} className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${forecastTime === 0 ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'text-slate-400 hover:text-white'}`}>
                      <Activity size={14} aria-hidden="true"/> LIVE
                    </button>
                    <button aria-pressed={forecastTime === 15} onClick={() => setForecastTime(15)} className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${forecastTime === 15 ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50' : 'text-slate-400 hover:text-white'}`}>
                      <Clock size={14} aria-hidden="true"/> +15 MIN
                    </button>
                    <button aria-pressed={forecastTime === 30} onClick={() => setForecastTime(30)} className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${forecastTime === 30 ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50' : 'text-slate-400 hover:text-white'}`}>
                      <Clock size={14} aria-hidden="true"/> +30 MIN
                    </button>
                  </div>
                </div>

                <div aria-live="polite" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {dashboardData?.zones.map((zone) => (
                    <div key={zone.id} className={`p-4 border rounded-xl shadow-sm transition-all duration-500 ${getHeatmapColor(zone.density)}`}>
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-sm text-white">{zone.name}</span>
                        <span className="text-xs bg-slate-900/60 px-2 py-0.5 rounded-md font-mono">{zone.density}% Cap</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section aria-label="SOP Oracle" className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-md">
                 <div className="flex items-center gap-2 text-emerald-400 mb-4">
                  <BookOpen size={18} aria-hidden="true" />
                  <h2 className="text-sm font-bold uppercase tracking-wider">SOP Command Oracle</h2>
                </div>
                <form onSubmit={handleOracleQuery} className="flex gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={16} aria-hidden="true" />
                    <input 
                      aria-label="Search Operating Procedures"
                      type="text" 
                      value={oracleInput}
                      onChange={(e) => setOracleInput(e.target.value)}
                      placeholder="Ask the policy manual... (e.g. 'What is the lost child protocol?')" 
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <button type="submit" disabled={oracleLoading || !oracleInput} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    {oracleLoading ? 'Searching...' : 'Ask Oracle'}
                  </button>
                </form>
                {oracleAnswer && (
                  <div aria-live="polite" className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg text-sm text-emerald-100 whitespace-pre-wrap leading-relaxed">
                    {oracleAnswer}
                  </div>
                )}
              </section>

            </div>

            <div className="space-y-6">
              
              <section aria-label="Translation Studio" className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-md">
                <div className="flex items-center gap-2 text-blue-400 mb-4">
                  <Languages size={18} aria-hidden="true" /><h2 className="text-sm font-bold uppercase tracking-wider">Translation Studio</h2>
                </div>
                <div className="space-y-3">
                  <textarea aria-label="Broadcast Message Input" value={draftMsg} onChange={(e) => setDraftMsg(e.target.value)} placeholder="Type stadium instruction..." className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500" rows="3" />
                  <div className="flex gap-2">
                    <select aria-label="Target Language" value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white flex-1 cursor-pointer">
                      {SUPPORTED_LANGUAGES.map(l => <option key={l.name} value={l.name} className="bg-slate-800">{l.name}</option>)}
                    </select>
                    <button onClick={handleTranslate} disabled={isTranslating || !draftMsg} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer shadow-sm">
                      {isTranslating ? <RefreshCw size={16} className="animate-spin" aria-hidden="true" /> : 'Translate'}
                    </button>
                  </div>
                  {translatedText && (
                    <div aria-live="polite" className="mt-2 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg"><p className="text-sm text-blue-100">{translatedText}</p></div>
                  )}
                  <div className="flex gap-2 pt-2 border-t border-slate-700 mt-4">
                    <button onClick={() => playAudio(translatedText || draftMsg, targetLang)} disabled={!draftMsg && !translatedText} className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium py-2 rounded-lg cursor-pointer text-sm shadow-sm flex justify-center items-center gap-2"><Volume2 size={16} aria-hidden="true" /> Preview Audio</button>
                    <button onClick={handleBroadcast} disabled={!draftMsg && !translatedText} className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-2 rounded-lg cursor-pointer text-sm shadow-md flex justify-center items-center gap-2"><Megaphone size={16} aria-hidden="true" /> Push Live</button>
                  </div>
                </div>
              </section>

              <section aria-label="AI Briefing" className="bg-indigo-950/80 p-5 rounded-xl border border-indigo-500/30 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Activity size={18} aria-hidden="true" />
                    <h2 className="text-sm font-bold uppercase tracking-wider">
                      {forecastTime === 0 ? 'Live AI Briefing' : 'Predictive AI Briefing'}
                    </h2>
                  </div>
                  {dashLoading && <RefreshCw size={14} className="text-indigo-400 animate-spin" aria-label="Loading..." />}
                </div>
                <div aria-live="polite" className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed font-mono text-xs">
                  {dashboardData?.ai_briefing}
                </div>
              </section>

            </div>
          </div>
        </main>
      )}
    </div>
  );
}

export default App;