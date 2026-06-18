"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, addDoc, getDocs, updateDoc, doc, setDoc, getDoc, query, orderBy, deleteDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isSkillModalOpen, setIsSkillModalOpen] = useState(false);
  const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("ar"); 
  
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [logs, setLogs] = useState([]);
  const [skills, setSkills] = useState([]);
  const [socialData, setSocialData] = useState({ github: "", linkedin: "", phone: "", email: "", whatsapp: "" });

  // تتبع العناصر التي يتم تعديلها
  const [editingLogId, setEditingLogId] = useState(null);
  const [editingSkillId, setEditingSkillId] = useState(null);

  const router = useRouter();
  const params = useParams();
  const lang = params?.lang || "en";

  const getTodayDate = () => new Date().toISOString().split("T")[0];

  const [logData, setLogData] = useState({ 
    date: getTodayDate(), 
    isExpandable: true, 
    image: null, 
    imageUrl: "", // للاحتفاظ برابط الصورة القديمة عند التعديل
    ar: { title: "", description: "", content: "" }, 
    en: { title: "", description: "", content: "" } 
  });
  
  const [skillData, setSkillData] = useState({ order: 1, arTitle: "", enTitle: "", itemsStr: "" });

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  };

  const fetchData = async () => {
    try {
      const msgQ = query(collection(db, "messages"), orderBy("createdAt", "desc"));
      const msgSnap = await getDocs(msgQ);
      const msgs = []; let unread = 0;
      msgSnap.forEach((d) => { msgs.push({ id: d.id, ...d.data() }); if (!d.data().isRead) unread++; });
      setMessages(msgs); setUnreadCount(unread);

      const postQ = query(collection(db, "posts"), orderBy("createdAt", "desc"));
      const postSnap = await getDocs(postQ);
      const fetchedLogs = [];
      postSnap.forEach((d) => fetchedLogs.push({ id: d.id, ...d.data() }));
      setLogs(fetchedLogs);

      const skillQ = query(collection(db, "skills"), orderBy("order", "asc"));
      const skillSnap = await getDocs(skillQ);
      const fetchedSkills = [];
      skillSnap.forEach((d) => fetchedSkills.push({ id: d.id, ...d.data() }));
      setSkills(fetchedSkills);

      const socialDoc = await getDoc(doc(db, "settings", "socials"));
      if (socialDoc.exists()) setSocialData(socialDoc.data());

    } catch (error) {
      console.error("Error fetching data: ", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) { setIsLoading(false); fetchData(); } 
      else { router.push(`/${lang}/admin`); }
    });
    return () => unsubscribe();
  }, [router, lang]);

  const handleDeleteLog = async (id) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this log?");
    if (confirmDelete) {
      try { await deleteDoc(doc(db, "posts", id)); setLogs(logs.filter(log => log.id !== id)); } 
      catch (error) { console.error("Error deleting log:", error); }
    }
  };

  const handleDeleteSkill = async (id) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this category?");
    if (confirmDelete) {
      try { await deleteDoc(doc(db, "skills", id)); setSkills(skills.filter(skill => skill.id !== id)); } 
      catch (error) { console.error("Error deleting skill:", error); }
    }
  };

  // فتح نافذة التعديل للسجلات
  const handleEditLog = (log) => {
    setEditingLogId(log.id);
    setLogData({
      date: log.date || getTodayDate(),
      isExpandable: log.isExpandable || false,
      image: null,
      imageUrl: log.imageUrl || "", 
      ar: log.ar || { title: "", description: "", content: "" },
      en: log.en || { title: "", description: "", content: "" }
    });
    setIsLogModalOpen(true);
  };

  // فتح نافذة التعديل للمهارات
  const handleEditSkill = (skill) => {
    setEditingSkillId(skill.id);
    setSkillData({
      order: skill.order || 1,
      arTitle: skill.arTitle || "",
      enTitle: skill.enTitle || "",
      itemsStr: skill.items ? skill.items.join(", ") : ""
    });
    setIsSkillModalOpen(true);
  };

  // إعادة تعيين النماذج للإضافة الجديدة
  const openNewLogModal = () => {
    setEditingLogId(null);
    setLogData({ date: getTodayDate(), isExpandable: true, image: null, imageUrl: "", ar: { title: "", description: "", content: "" }, en: { title: "", description: "", content: "" } });
    setIsLogModalOpen(true);
  };

  const openNewSkillModal = () => {
    setEditingSkillId(null);
    setSkillData({ order: 1, arTitle: "", enTitle: "", itemsStr: "" });
    setIsSkillModalOpen(true);
  };

  const markAsRead = async (id) => {
    try { await updateDoc(doc(db, "messages", id), { isRead: true }); setMessages(messages.map(m => m.id === id ? { ...m, isRead: true } : m)); setUnreadCount(p => p > 0 ? p - 1 : 0); } 
    catch (e) { console.error(e); }
  };

  const handleLogout = async () => { await signOut(auth); router.push(`/${lang}/admin`); };
  const handleTextChange = (langKey, field, value) => setLogData(prev => ({ ...prev, [langKey]: { ...prev[langKey], [field]: value } }));

  // تعديل أو إضافة السجلات
  const handleLogSubmit = async (e) => {
    e.preventDefault(); setIsSubmitting(true);
    try {
      let finalImageUrl = logData.imageUrl; // نستخدم الصورة القديمة مبدئياً
      
      // إذا تم اختيار صورة جديدة، ارفعها واستبدل الرابط القديم
      if (logData.image) { 
        const formData = new FormData();
        formData.append("image", logData.image);
        const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.NEXT_PUBLIC_IMGBB_API_KEY}`, {
          method: "POST",
          body: formData,
        });
        const imgbbData = await imgbbRes.json();
        if (imgbbData.success) {
          finalImageUrl = imgbbData.data.url; 
        }
      }

      const postPayload = { 
        date: logData.date || getTodayDate(), 
        imageUrl: finalImageUrl, 
        isExpandable: logData.isExpandable, 
        ar: logData.ar, 
        en: logData.en
      };

      if (editingLogId) {
        await updateDoc(doc(db, "posts", editingLogId), postPayload);
        alert("Log Updated successfully!");
      } else {
        postPayload.createdAt = new Date();
        await addDoc(collection(db, "posts"), postPayload);
        alert("Log added successfully!");
      }

      setIsLogModalOpen(false); 
      setEditingLogId(null);
      fetchData(); 
    } catch (e) { console.error(e); alert("Error"); } finally { setIsSubmitting(false); }
  };

  // تعديل أو إضافة المهارات
  const handleSkillSubmit = async (e) => {
    e.preventDefault(); setIsSubmitting(true);
    try {
      const itemsArray = skillData.itemsStr.split(",").map(i => i.trim()).filter(i => i !== "");
      const skillPayload = { order: Number(skillData.order), arTitle: skillData.arTitle, enTitle: skillData.enTitle, items: itemsArray };
      
      if (editingSkillId) {
        await updateDoc(doc(db, "skills", editingSkillId), skillPayload);
        alert("Category Updated!");
      } else {
        await addDoc(collection(db, "skills"), skillPayload);
        alert("Category Added!");
      }

      setIsSkillModalOpen(false); 
      setEditingSkillId(null);
      fetchData(); 
    } catch (e) { console.error(e); alert("Error"); } finally { setIsSubmitting(false); }
  };

  const handleSocialSubmit = async (e) => {
    e.preventDefault(); setIsSubmitting(true);
    try { await setDoc(doc(db, "settings", "socials"), socialData); setIsSocialModalOpen(false); alert("Links updated!"); } catch (e) { console.error(e); alert("Error"); } finally { setIsSubmitting(false); }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-[#050505]"><div className="w-10 h-10 border-4 border-cyan border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 md:p-12 relative overflow-hidden flex flex-col">
      <div className="absolute top-0 left-0 w-[40rem] h-[40rem] bg-cyan/5 blur-[150px] rounded-full pointer-events-none -z-10" />

      <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-12 bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-md">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-bold tracking-widest text-cyan uppercase mb-1">Central Command</h1>
            <p className="text-muted text-sm font-mono uppercase tracking-wider">Auth Verified: System Admin</p>
          </div>
          {unreadCount > 0 && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 px-4 py-2 rounded-lg">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-red-500 font-mono text-sm">{unreadCount} New Transmissions</span>
            </div>
          )}
        </div>
        <button onClick={handleLogout} className="px-6 py-2 bg-red-500/10 border border-red-500/50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors font-mono text-sm uppercase">Disconnect</button>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
        
        <section className="bg-glass border border-white/10 rounded-2xl p-6 md:p-8 flex flex-col h-fit lg:col-span-3">
          <h2 className="text-xl font-semibold tracking-wide flex items-center gap-3 mb-8 border-b border-white/10 pb-4">
            Incoming Transmissions (Inbox)
            {unreadCount > 0 && <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">{unreadCount}</span>}
          </h2>
          <div className="flex flex-col gap-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
            {messages.length === 0 ? <p className="text-muted text-center font-mono py-6">No messages received yet.</p> : messages.map((msg) => (
              <div key={msg.id} className={`p-4 rounded-xl border transition-all ${msg.isRead ? 'bg-white/5 border-white/10 opacity-70' : 'bg-cyan/10 border-cyan/50 shadow-[0_0_15px_rgba(34,211,238,0.1)]'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-lg text-white">{msg.name}</h4>
                    <a href={`mailto:${msg.email}`} className="text-cyan text-sm font-mono hover:underline">{msg.email}</a>
                  </div>
                  {!msg.isRead && <button onClick={() => markAsRead(msg.id)} className="text-xs bg-cyan/20 text-cyan px-3 py-1 rounded-full hover:bg-cyan hover:text-black font-bold">Mark Read</button>}
                </div>
                <p className="text-white/80 mt-4 text-sm">{msg.message}</p>
              </div>
            ))}
          </div>
        </section>

        {/* قسم إدارة السجلات */}
        <section className="bg-glass border border-white/10 rounded-2xl p-6 flex flex-col h-[400px]">
          <div className="flex justify-between mb-4 border-b border-white/10 pb-4">
            <h2 className="font-semibold tracking-wide">System Logs</h2>
            <button onClick={openNewLogModal} className="bg-cyan text-black px-3 py-1 rounded hover:bg-cyan/80 text-sm font-bold">+ Add</button>
          </div>
          <div className="overflow-y-auto custom-scrollbar flex-1 pr-2 flex flex-col gap-3">
            {logs.length === 0 ? <p className="text-white/30 text-sm text-center mt-4">No logs found.</p> : logs.map(log => (
              <div key={log.id} className="bg-black/40 p-3 rounded-lg border border-white/5 flex justify-between items-center group">
                <div className="truncate pr-4 flex-1">
                  <p className="text-sm font-bold truncate text-white">{lang === "ar" ? log.ar?.title : log.en?.title}</p>
                  <p className="text-xs text-cyan font-mono">{formatDate(log.date)}</p>
                </div>
                <div className="flex gap-2">
                  {/* زر التعديل */}
                  <button onClick={() => handleEditLog(log)} className="text-cyan/70 hover:text-cyan transition-colors" title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                  </button>
                  {/* زر الحذف */}
                  <button onClick={() => handleDeleteLog(log.id)} className="text-red-500/50 hover:text-red-500 transition-colors" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* قسم إدارة التقنيات والمهارات */}
        <section className="bg-glass border border-white/10 rounded-2xl p-6 flex flex-col h-[400px]">
          <div className="flex justify-between mb-4 border-b border-white/10 pb-4">
            <h2 className="font-semibold tracking-wide">Tech Stack</h2>
            <button onClick={openNewSkillModal} className="bg-cyan text-black px-3 py-1 rounded hover:bg-cyan/80 text-sm font-bold">+ Add</button>
          </div>
          <div className="overflow-y-auto custom-scrollbar flex-1 pr-2 flex flex-col gap-3">
            {skills.length === 0 ? <p className="text-white/30 text-sm text-center mt-4">No categories found.</p> : skills.map(skill => (
              <div key={skill.id} className="bg-black/40 p-3 rounded-lg border border-white/5 flex justify-between items-center group">
                <div className="truncate pr-4 flex-1">
                  <p className="text-sm font-bold truncate text-white">{lang === "ar" ? skill.arTitle : skill.enTitle}</p>
                  <p className="text-xs text-cyan font-mono">Items: {skill.items?.length || 0}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEditSkill(skill)} className="text-cyan/70 hover:text-cyan transition-colors" title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                  </button>
                  <button onClick={() => handleDeleteSkill(skill.id)} className="text-red-500/50 hover:text-red-500 transition-colors" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-glass border border-white/10 rounded-2xl p-6 flex flex-col">
          <div className="flex justify-between mb-4 border-b border-white/10 pb-4">
            <h2 className="font-semibold tracking-wide">Social & Links</h2>
            <button onClick={() => setIsSocialModalOpen(true)} className="bg-cyan text-black px-3 py-1 rounded hover:bg-cyan/80 text-sm font-bold">Edit</button>
          </div>
          <div className="flex flex-col gap-2 font-mono text-sm">
            <p className="text-white/60 truncate"><span className="text-cyan">GH:</span> {socialData.github || '---'}</p>
            <p className="text-white/60 truncate"><span className="text-cyan">IN:</span> {socialData.linkedin || '---'}</p>
            <p className="text-white/60 truncate"><span className="text-cyan">TEL:</span> {socialData.phone || '---'}</p>
            <p className="text-white/60 truncate"><span className="text-cyan">MAIL:</span> {socialData.email || '---'}</p>
          </div>
        </section>

      </main>

      {/* نافذة السجلات */}
      <AnimatePresence>
        {isLogModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#0a0a0a] border border-cyan/30 rounded-2xl p-6 shadow-2xl custom-scrollbar">
              <div className="flex justify-between mb-6"><h3 className="text-2xl font-bold">{editingLogId ? "Edit Log" : "Add Log"}</h3><button onClick={() => setIsLogModalOpen(false)} className="text-white/50 hover:text-red-500">✖</button></div>
              <form onSubmit={handleLogSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4 bg-white/5 p-4 rounded-xl">
                  <input 
                    type="date" 
                    value={logData.date} 
                    onChange={e => setLogData({...logData, date: e.target.value})} 
                    className="bg-black/50 border border-white/10 rounded-lg p-2 text-white w-full" 
                    style={{ colorScheme: "dark" }}
                    required 
                  />
                  <div className="flex flex-col gap-1">
                    <input type="file" accept="image/*" onChange={e => setLogData({...logData, image: e.target.files[0]})} className="text-sm text-white/50 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-cyan/10 file:text-cyan hover:file:bg-cyan/20 cursor-pointer" />
                    {editingLogId && logData.imageUrl && !logData.image && <span className="text-xs text-green-400 font-mono">Image exists. Upload new to replace.</span>}
                  </div>
                  <div className="col-span-2 flex items-center gap-3"><input type="checkbox" id="exp" checked={logData.isExpandable} onChange={e => setLogData({...logData, isExpandable: e.target.checked})} /><label htmlFor="exp" className="text-sm">Enable Expand</label></div>
                </div>
                <div className="flex border-b border-white/10"><button type="button" onClick={() => setActiveTab("ar")} className={`flex-1 py-3 ${activeTab==="ar"?"text-cyan border-b-2 border-cyan":"text-white/50"}`}>AR</button><button type="button" onClick={() => setActiveTab("en")} className={`flex-1 py-3 ${activeTab==="en"?"text-cyan border-b-2 border-cyan":"text-white/50"}`}>EN</button></div>
                <div className="space-y-4">
                  <input type="text" placeholder="Title" value={logData[activeTab].title} onChange={e => handleTextChange(activeTab, "title", e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white" required />
                  <textarea placeholder="Description" value={logData[activeTab].description} onChange={e => handleTextChange(activeTab, "description", e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white h-24" required />
                  {logData.isExpandable && <textarea placeholder="Full Content" value={logData[activeTab].content} onChange={e => handleTextChange(activeTab, "content", e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white h-40" required />}
                </div>
                <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-cyan/10 text-cyan font-bold rounded-lg border border-cyan/50 hover:bg-cyan hover:text-black">
                  {editingLogId ? "UPDATE LOG" : "SAVE LOG"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* نافذة المهارات */}
      <AnimatePresence>
        {isSkillModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-2xl bg-[#0a0a0a] border border-cyan/30 rounded-2xl p-6 shadow-2xl">
              <div className="flex justify-between mb-6"><h3 className="text-2xl font-bold">{editingSkillId ? "Edit Category" : "Add Category"}</h3><button onClick={() => setIsSkillModalOpen(false)} className="text-white/50 hover:text-red-500">✖</button></div>
              <form onSubmit={handleSkillSubmit} className="space-y-6">
                <input type="number" value={skillData.order} onChange={e => setSkillData({...skillData, order: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white" required placeholder="Order (1, 2...)" />
                <div className="grid grid-cols-2 gap-4">
                  <input type="text" placeholder="AR Title" value={skillData.arTitle} onChange={e => setSkillData({...skillData, arTitle: e.target.value})} className="bg-black/50 border border-white/10 rounded-lg p-3 text-white" required />
                  <input type="text" placeholder="EN Title" value={skillData.enTitle} onChange={e => setSkillData({...skillData, enTitle: e.target.value})} className="bg-black/50 border border-white/10 rounded-lg p-3 text-white" required />
                </div>
                <textarea placeholder="Skills (comma separated)" value={skillData.itemsStr} onChange={e => setSkillData({...skillData, itemsStr: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white h-24" required />
                <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-cyan/10 text-cyan font-bold rounded-lg border border-cyan/50 hover:bg-cyan hover:text-black">
                  {editingSkillId ? "UPDATE CATEGORY" : "SAVE CATEGORY"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSocialModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-2xl bg-[#0a0a0a] border border-cyan/30 rounded-2xl p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Update Social Links</h3>
                <button onClick={() => setIsSocialModalOpen(false)} className="text-white/50 hover:text-red-500">✖</button>
              </div>
              <form onSubmit={handleSocialSubmit} className="space-y-4">
                <div><label className="text-xs text-cyan font-mono">GITHUB URL</label><input type="url" value={socialData.github} onChange={e => setSocialData({...socialData, github: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 mt-1" /></div>
                <div><label className="text-xs text-cyan font-mono">LINKEDIN URL</label><input type="url" value={socialData.linkedin} onChange={e => setSocialData({...socialData, linkedin: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 mt-1" /></div>
                <div><label className="text-xs text-cyan font-mono">PHONE NUMBER</label><input type="tel" value={socialData.phone} onChange={e => setSocialData({...socialData, phone: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 mt-1" /></div>
                <div><label className="text-xs text-cyan font-mono">EMAIL ADDRESS</label><input type="email" value={socialData.email} onChange={e => setSocialData({...socialData, email: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 mt-1" /></div>
                <button type="submit" disabled={isSubmitting} className="w-full py-4 mt-4 bg-cyan/10 border border-cyan/50 text-cyan font-bold rounded-lg hover:bg-cyan hover:text-black transition-colors">
                  {isSubmitting ? "UPDATING..." : "SAVE LINKS"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}