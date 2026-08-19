import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, Circle, Flame, TrendingUp, BarChart3, 
  LogOut, Plus, Trash2, Users, Calendar, ArrowLeft, ArrowRight,
  Activity, Target, ShieldCheck, Loader2, AlertCircle, X
} from 'lucide-react';

// ==========================================
// [백엔드 연동] 공식 Supabase SDK 설정
// ==========================================
// Canvas 환경 호환 및 단일 파일 동작을 위해 esm.sh CDN 패키지를 사용합니다.
// GitHub 배포 후 로컬 환경(npm)에서는 `import { createClient } from '@supabase/supabase-js'` 로 변경하여 사용하시면 됩니다.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://scqkzxkhxqccusvvptag.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jPJXQr3KZt507QSjjgII_w_-cxMaO33';
const ADMIN_CODE = 'ADMIN2026';

// 공식 SDK 클라이언트 인스턴스 생성
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 공통 유틸리티 함수
// ==========================================

// 날짜 유틸리티 포맷터 (YYYY-MM-DD)
const formatDate = (date) => {
  const d = new Date(date);
  const month = '' + (d.getMonth() + 1);
  const day = '' + d.getDate();
  const year = d.getFullYear();
  return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
};

// 연속 달성 일수 (Streak) 계산 함수
const calculateStreak = (habitId, logs, checkType, todayDate) => {
  let streak = 0;
  let currentDate = new Date(todayDate);

  while (true) {
    const dateStr = formatDate(currentDate);
    const log = logs.find(l => l.habit_id === habitId && l.date === dateStr);
    
    const isCompleted = log && (
      (checkType === 'boolean' && log.is_completed) || 
      (checkType === 'numeric' && log.numeric_value > 0)
    );

    if (isCompleted) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      // 오늘은 기록이 없더라도 Streak이 끊기지 않도록 예외 처리
      if (streak === 0 && dateStr === todayDate) {
         currentDate.setDate(currentDate.getDate() - 1);
         continue;
      }
      break;
    }
  }
  return streak;
};

// 주간 달성률 계산 함수 (최근 7일 기준)
const calculateWeeklyRate = (habitId, logs, checkType, todayDate) => {
  let successes = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);
    const log = logs.find(l => l.habit_id === habitId && l.date === dateStr);
    
    if (log && ((checkType === 'boolean' && log.is_completed) || (checkType === 'numeric' && log.numeric_value > 0))) {
      successes++;
    }
  }
  return Math.round((successes / 7) * 100);
};

// ==========================================
// DB 조작을 위한 커스텀 훅 (SDK 메서드 활용)
// ==========================================
const useSupabaseData = () => {
  const [users, setUsers] = useState([]);
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // 에러 발생 시 UI에 띄울 메시지 처리 함수
  const showError = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 5000); // 5초 후 자동 닫힘
  };

  // 1. 초기 데이터 로드 (.select() 메서드 사용)
  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [usersRes, habitsRes, logsRes] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('habits').select('*'),
        supabase.from('habit_logs').select('*')
      ]);

      if (usersRes.error) throw usersRes.error;
      if (habitsRes.error) throw habitsRes.error;
      if (logsRes.error) throw logsRes.error;

      setUsers(usersRes.data || []);
      setHabits(habitsRes.data || []);
      setHabitLogs(logsRes.data || []);
    } catch (err) {
      console.error("데이터 로드 실패:", err);
      showError("데이터를 불러오는데 실패했습니다: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // 2. DB 조작 함수들 (SDK 메서드 기반 + 낙관적 업데이트)
  const api = {
    // [유저 관리]
    addUser: async (user_code) => {
      const newUser = { user_code };
      // 낙관적 업데이트
      const tempUser = { id: 'temp-' + Date.now(), user_code, created_at: new Date().toISOString() };
      setUsers(prev => [...prev, tempUser]); 
      
      const { data, error } = await supabase.from('users').insert([newUser]).select();
      
      if (error) {
        showError('사용자 생성 중 오류가 발생했습니다: ' + error.message);
        fetchAllData(); // 에러 시 복구
      } else if (data && data.length > 0) {
        setUsers(prev => prev.map(u => u.user_code === user_code ? data[0] : u));
      }
    },
    
    deleteUser: async (user_code) => {
      // 연관 데이터 로컬에서 우선 제거
      setUsers(prev => prev.filter(u => u.user_code !== user_code));
      setHabits(prev => prev.filter(h => h.user_code !== user_code));
      setHabitLogs(prev => prev.filter(l => l.user_code !== user_code));

      const { error } = await supabase.from('users').delete().eq('user_code', user_code);
      if (error) {
        showError('사용자 삭제 중 오류가 발생했습니다: ' + error.message);
        fetchAllData();
      }
    },
    
    // [습관 관리]
    addHabit: async (habit) => {
      const { data, error } = await supabase.from('habits').insert([habit]).select();
      
      if (error) {
        showError('습관 생성 중 오류가 발생했습니다: ' + error.message);
      } else if (data && data.length > 0) {
         setHabits(prev => [...prev, data[0]]);
      }
    },
    
    deleteHabit: async (habitId) => {
      setHabits(prev => prev.filter(h => h.id !== habitId));
      setHabitLogs(prev => prev.filter(l => l.habit_id !== habitId));

      const { error } = await supabase.from('habits').delete().eq('id', habitId);
      if (error) {
        showError('습관 삭제 중 오류가 발생했습니다: ' + error.message);
        fetchAllData();
      }
    },

    // [기록 관리]
    upsertLog: async (logData) => {
      const existing = habitLogs.find(l => l.habit_id === logData.habit_id && l.date === logData.date);
      
      if (existing) {
        // [수정] 낙관적 업데이트 및 .update()
        setHabitLogs(prev => prev.map(l => 
          l.id === existing.id 
            ? { ...l, is_completed: logData.is_completed, numeric_value: logData.numeric_value } 
            : l
        ));

        const { error } = await supabase
          .from('habit_logs')
          .update({ is_completed: logData.is_completed, numeric_value: logData.numeric_value })
          .eq('id', existing.id);

        if (error) {
          showError('기록 업데이트 중 오류가 발생했습니다: ' + error.message);
          fetchAllData();
        }
      } else {
        // [생성] 낙관적 업데이트 및 .insert()
        const tempLog = { id: 'temp-' + Date.now(), ...logData, created_at: new Date().toISOString() };
        setHabitLogs(prev => [...prev, tempLog]);

        const { data, error } = await supabase.from('habit_logs').insert([logData]).select();
        
        if (error) {
          showError('새로운 기록 추가 중 오류가 발생했습니다: ' + error.message);
          setHabitLogs(prev => prev.filter(l => l.id !== tempLog.id)); // 롤백
        } else if (data && data.length > 0) {
          setHabitLogs(prev => prev.map(l => l.id === tempLog.id ? data[0] : l)); // 확정
        }
      }
    }
  };

  return { users, habits, habitLogs, api, isLoading, fetchAllData, errorMsg, setErrorMsg };
};

// ==========================================
// 공통 컴포넌트: Confirm Modal & Error Toast
// ==========================================
const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-6 rounded-2xl max-w-sm w-full shadow-2xl">
        <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
        <p className="text-slate-600 mb-6 text-sm leading-relaxed">{message}</p>
        <div className="flex space-x-3">
          <button onClick={onCancel} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors">취소</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors">삭제하기</button>
        </div>
      </div>
    </div>
  );
};

const ErrorToast = ({ message, onClose }) => {
  if (!message) return null;
  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[150] w-full max-w-md px-4 animate-in slide-in-from-top-4 duration-300">
      <div className="bg-red-50 border border-red-200 p-4 rounded-2xl shadow-lg flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <p className="flex-1 text-sm text-red-700 font-medium leading-relaxed">{message}</p>
        <button onClick={onClose} className="text-red-400 hover:text-red-600">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 스크린 컴포넌트 1: 인증 스크린 (로그인)
// ==========================================
const AuthScreen = ({ onLogin, isAuthProcessing }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code.trim() === '') {
      setError('접속 코드를 입력해주세요.');
      return;
    }
    await onLogin(code.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden">
      {/* 백그라운드 데코레이션 */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-200 rounded-full blur-[100px] opacity-40"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-200 rounded-full blur-[100px] opacity-40"></div>
      
      <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-xl w-full max-w-md border border-white relative z-10">
        <div className="text-center mb-8">
          <div className="bg-gradient-to-tr from-emerald-500 to-teal-400 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-200">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">습관 관제 시스템</h1>
          <p className="text-slate-500 mt-2 text-sm">개인 접속 코드 또는 관리자 코드를 입력하세요.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <input
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(''); }}
              placeholder="예: USER01, ADMIN2026"
              disabled={isAuthProcessing}
              className="w-full px-5 py-3.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all uppercase disabled:bg-slate-100 disabled:text-slate-400 font-medium"
            />
            {error && <p className="text-red-500 text-sm mt-2 font-medium">{error}</p>}
          </div>
          <button 
            type="submit" 
            disabled={isAuthProcessing}
            className="w-full bg-slate-800 text-white font-semibold py-3.5 rounded-xl hover:bg-slate-900 transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isAuthProcessing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
            {isAuthProcessing ? '동기화 중...' : '시작하기'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// 스크린 컴포넌트 2: 유저 습관 트래커
// ==========================================
const UserHabitTracker = ({ userCode, habits, logs, api, isLoading }) => {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [isAdding, setIsAdding] = useState(false);
  const [newHabit, setNewHabit] = useState({ title: '', category: '건강', check_type: 'boolean', unit: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null, title: '' });

  // 본인 데이터만 필터링
  const userHabits = habits.filter(h => h.user_code === userCode);

  const handleDateChange = (days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(formatDate(d));
  };

  const handleAddHabit = async (e) => {
    e.preventDefault();
    if (!newHabit.title) return;
    
    setIsSubmitting(true);
    await api.addHabit({ ...newHabit, user_code: userCode });
    setIsSubmitting(false);
    
    setIsAdding(false);
    setNewHabit({ title: '', category: '건강', check_type: 'boolean', unit: '' });
  };

  const executeDeleteHabit = async () => {
    if (deleteModal.id) {
      await api.deleteHabit(deleteModal.id);
      setDeleteModal({ isOpen: false, id: null, title: '' });
    }
  };

  const toggleBooleanLog = (habitId, currentStatus) => {
    api.upsertLog({ habit_id: habitId, user_code: userCode, date: selectedDate, is_completed: !currentStatus, numeric_value: null });
  };

  const updateNumericLog = (habitId, value) => {
    const num = parseFloat(value);
    api.upsertLog({ habit_id: habitId, user_code: userCode, date: selectedDate, is_completed: num > 0, numeric_value: isNaN(num) ? 0 : num });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-emerald-600">
        <Loader2 className="w-10 h-10 animate-spin mb-4" />
        <p className="font-medium text-slate-600">데이터를 불러오는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-20 animate-in fade-in">
      <ConfirmModal 
        isOpen={deleteModal.isOpen} 
        title={`'${deleteModal.title}' 삭제`}
        message="정말로 이 습관을 삭제하시겠습니까? 관련된 모든 누적 기록이 함께 영구 삭제됩니다."
        onCancel={() => setDeleteModal({ isOpen: false, id: null, title: '' })}
        onConfirm={executeDeleteHabit}
      />

      {/* 날짜 선택기 */}
      <div className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
        <button onClick={() => handleDateChange(-1)} className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex items-center space-x-2 font-bold text-lg text-slate-800">
          <Calendar className="w-5 h-5 text-emerald-600" />
          <span>{selectedDate === formatDate(new Date()) ? '오늘의 기록' : selectedDate}</span>
        </div>
        <button onClick={() => handleDateChange(1)} disabled={selectedDate === formatDate(new Date())} className={`p-2.5 rounded-xl transition-colors ${selectedDate === formatDate(new Date()) ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-100 text-slate-600'}`}><ArrowRight className="w-5 h-5" /></button>
      </div>

      {/* 습관 목록 */}
      <div className="space-y-4">
        {userHabits.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-slate-200">
            <Target className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">아직 등록된 습관이 없습니다.<br/>새로운 도전을 시작해보세요!</p>
          </div>
        ) : (
          userHabits.map(habit => {
            const todayLog = logs.find(l => l.habit_id === habit.id && l.date === selectedDate);
            const isCompleted = todayLog ? (habit.check_type === 'boolean' ? todayLog.is_completed : todayLog.numeric_value > 0) : false;
            const numValue = todayLog && todayLog.numeric_value !== null && todayLog.numeric_value !== undefined ? todayLog.numeric_value : '';
            const streak = calculateStreak(habit.id, logs, habit.check_type, formatDate(new Date()));
            const weeklyRate = calculateWeeklyRate(habit.id, logs, habit.check_type, selectedDate);

            return (
              <div key={habit.id} className={`bg-white p-5 rounded-2xl shadow-sm border-l-[5px] transition-all duration-300 ${isCompleted ? 'border-l-emerald-500 shadow-md transform scale-[1.01]' : 'border-l-slate-200 hover:border-l-slate-300'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md">{habit.category}</span>
                        {streak >= 3 && <span className="flex items-center text-xs font-bold text-orange-600 bg-orange-100 px-2.5 py-1 rounded-md animate-pulse"><Flame className="w-3.5 h-3.5 mr-1" /> {streak}일 연속!</span>}
                      </div>
                      <button 
                        onClick={() => setDeleteModal({ isOpen: true, id: habit.id, title: habit.title })} 
                        className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                        title="습관 삭제"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                    
                    <h3 className={`text-xl font-bold tracking-tight ${isCompleted ? 'text-slate-800' : 'text-slate-700'}`}>{habit.title}</h3>
                    
                    <div className="mt-4 flex items-center space-x-3">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-700 ease-out" style={{ width: `${weeklyRate}%` }}></div>
                      </div>
                      <span className="text-xs font-bold text-slate-400 w-12 text-right">주 {weeklyRate}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end sm:justify-start">
                    {habit.check_type === 'boolean' ? (
                      <button 
                        onClick={() => toggleBooleanLog(habit.id, isCompleted)}
                        className={`p-3 rounded-full transition-all duration-300 ${isCompleted ? 'text-emerald-500 bg-emerald-50 scale-110 shadow-sm' : 'text-slate-300 hover:text-slate-400 hover:bg-slate-50'}`}
                      >
                        {isCompleted ? <CheckCircle2 className="w-10 h-10" /> : <Circle className="w-10 h-10 stroke-1" />}
                      </button>
                    ) : (
                      <div className="flex items-center space-x-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                        <input 
                          type="number"
                          value={numValue}
                          onChange={(e) => updateNumericLog(habit.id, e.target.value)}
                          placeholder="0"
                          className="w-20 text-center font-bold text-lg px-2 py-2 border-none bg-white rounded-lg shadow-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                        <span className="text-slate-500 font-medium px-2">{habit.unit}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 습관 추가 폼 */}
      {!isAdding ? (
        <button onClick={() => setIsAdding(true)} className="w-full py-5 border-2 border-dashed border-emerald-200 text-emerald-600 bg-emerald-50/50 rounded-2xl font-bold flex items-center justify-center hover:bg-emerald-50 transition-colors shadow-sm">
          <Plus className="w-5 h-5 mr-2" /> 새 습관 추가하기
        </button>
      ) : (
        <form onSubmit={handleAddHabit} className="bg-white p-6 rounded-2xl shadow-md border border-emerald-100 space-y-5 animate-in slide-in-from-bottom-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">어떤 습관을 만들고 싶으신가요?</label>
            <input type="text" value={newHabit.title} onChange={e => setNewHabit({...newHabit, title: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all" placeholder="예: 매일 물 마시기, 아침 러닝" required autoFocus />
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">카테고리</label>
              <select value={newHabit.category} onChange={e => setNewHabit({...newHabit, category: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 transition-all bg-white">
                <option>건강</option><option>학습</option><option>생활</option><option>운동</option><option>멘탈</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">기록 방식</label>
              <select value={newHabit.check_type} onChange={e => setNewHabit({...newHabit, check_type: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 transition-all bg-white">
                <option value="boolean">O/X (완료 여부)</option>
                <option value="numeric">수치 (횟수/시간 등)</option>
              </select>
            </div>
          </div>
          {newHabit.check_type === 'numeric' && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">측정 단위 (예: L, 분, 회)</label>
              <input type="text" value={newHabit.unit} onChange={e => setNewHabit({...newHabit, unit: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 transition-all" required placeholder="예: 분" />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setIsAdding(false)} className="flex-1 bg-slate-100 text-slate-700 py-3.5 rounded-xl font-bold hover:bg-slate-200 transition-colors">취소</button>
            <button type="submit" disabled={isSubmitting} className="flex-[2] bg-emerald-600 text-white py-3.5 rounded-xl font-bold hover:bg-emerald-700 shadow-md shadow-emerald-200 transition-all flex items-center justify-center disabled:opacity-70">
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null} 추가 완료
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// ==========================================
// 스크린 컴포넌트 3: 사용자 통계
// ==========================================
const UserHabitStats = ({ userCode, habits, logs }) => {
  const userHabits = habits.filter(h => h.user_code === userCode);
  
  if (userHabits.length === 0) {
    return <div className="text-center py-16 text-slate-500">아직 분석할 데이터가 부족합니다.<br/>습관을 등록하고 체크해보세요!</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-20 animate-in fade-in">
      <div className="bg-slate-800 rounded-2xl p-6 text-white shadow-lg">
        <h2 className="text-xl font-bold flex items-center mb-2"><TrendingUp className="w-6 h-6 mr-2 text-emerald-400" /> 나의 성취 리포트</h2>
        <p className="text-slate-300 text-sm">현재까지 누적된 전체 습관 데이터를 분석한 결과입니다.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {userHabits.map(habit => {
          const habitLogs = logs.filter(l => l.habit_id === habit.id);
          
          const totalCompletions = habitLogs.filter(l => l.is_completed || l.numeric_value > 0).length;
          const totalNumericSum = habit.check_type === 'numeric' ? habitLogs.reduce((sum, l) => sum + (l.numeric_value || 0), 0) : 0;
          
          return (
            <div key={habit.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{habit.title}</h3>
                  <span className="inline-block mt-1 text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-500 rounded-md">{habit.check_type === 'boolean' ? 'O/X 기록형' : '수치 기록형'}</span>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-xl"><BarChart3 className="w-5 h-5 text-emerald-500" /></div>
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-600 font-medium">총 달성 일수</span>
                  <span className="font-bold text-slate-800 text-base">{totalCompletions}일</span>
                </div>
                
                {habit.check_type === 'numeric' && (
                  <>
                    <div className="flex justify-between items-center text-sm bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                      <span className="text-emerald-800 font-medium">누적 기록 합계</span>
                      <span className="font-bold text-emerald-600 text-base">{totalNumericSum.toLocaleString()} {habit.unit}</span>
                    </div>
                    {totalCompletions > 0 && (
                      <div className="flex justify-between items-center text-sm p-1 px-2">
                        <span className="text-slate-500">일 평균 (달성일 기준)</span>
                        <span className="font-bold text-slate-700">{(totalNumericSum / totalCompletions).toFixed(1)} {habit.unit}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
};

// ==========================================
// 스크린 컴포넌트 4: 관리자 대시보드
// ==========================================
const AdminDashboard = ({ data, api, isLoading }) => {
  const { users, habits, habitLogs } = data;
  const [activeTab, setActiveTab] = useState('overview');
  const [newUserCode, setNewUserCode] = useState('');
  const [assignForm, setAssignForm] = useState({ user_code: '', title: '', category: '공통', check_type: 'boolean', unit: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, userCode: '' });

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserCode) return;
    setIsProcessing(true);
    await api.addUser(newUserCode.toUpperCase());
    setNewUserCode('');
    setIsProcessing(false);
  };

  const handleAssignHabit = async (e) => {
    e.preventDefault();
    if (!assignForm.user_code || !assignForm.title) return;
    setIsProcessing(true);
    await api.addHabit({ ...assignForm });
    setAssignForm({ ...assignForm, title: '', unit: '' });
    setIsProcessing(false);
  };

  const executeDeleteUser = async () => {
    if (deleteModal.userCode) {
      await api.deleteUser(deleteModal.userCode);
      setDeleteModal({ isOpen: false, userCode: '' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-600">
        <Loader2 className="w-10 h-10 animate-spin mb-4" />
        <p className="font-bold">Supabase에서 전체 데이터를 가져오는 중...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-20 animate-in fade-in">
      <ConfirmModal 
        isOpen={deleteModal.isOpen} 
        title="사용자 영구 삭제"
        message={`'${deleteModal.userCode}' 유저와 관련된 모든 습관 데이터 및 기록이 데이터베이스에서 영구 삭제됩니다. 복구할 수 없습니다.`}
        onCancel={() => setDeleteModal({ isOpen: false, userCode: '' })}
        onConfirm={executeDeleteUser}
      />

      {/* 관리자 탭 메뉴 */}
      <div className="flex space-x-2 bg-slate-200/50 p-1.5 rounded-2xl mb-8">
        <button onClick={() => setActiveTab('overview')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'overview' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>전체 통계 현황</button>
        <button onClick={() => setActiveTab('users')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>계정 관리</button>
        <button onClick={() => setActiveTab('assign')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'assign' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>습관 일괄 부여</button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
              <div><p className="text-sm text-slate-500 font-medium mb-1">총 등록 사용자</p><h3 className="text-4xl font-bold text-slate-800">{users.length}</h3></div>
              <div className="p-4 bg-blue-50 rounded-2xl text-blue-500"><Users className="w-8 h-8"/></div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
              <div><p className="text-sm text-slate-500 font-medium mb-1">총 생성된 습관</p><h3 className="text-4xl font-bold text-slate-800">{habits.length}</h3></div>
              <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-500"><Target className="w-8 h-8"/></div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
              <div><p className="text-sm text-slate-500 font-medium mb-1">전체 누적 기록</p><h3 className="text-4xl font-bold text-slate-800">{habitLogs.length}</h3></div>
              <div className="p-4 bg-orange-50 rounded-2xl text-orange-500"><Activity className="w-8 h-8"/></div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800">사용자별 요약 대시보드</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-slate-700">유저 코드 (User ID)</th>
                    <th className="px-6 py-4 font-semibold text-slate-700">관리 중인 습관</th>
                    <th className="px-6 py-4 font-semibold text-slate-700">최근 접속/기록</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.length === 0 ? <tr><td colSpan="3" className="px-6 py-8 text-center text-slate-400">데이터가 없습니다.</td></tr> : users.map(user => {
                    const userHabitsCount = habits.filter(h => h.user_code === user.user_code).length;
                    const userLogs = habitLogs.filter(l => l.user_code === user.user_code).sort((a,b) => new Date(b.date) - new Date(a.date));
                    const lastActive = userLogs.length > 0 ? userLogs[0].date : '기록 없음';
                    return (
                      <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800">{user.user_code}</td>
                        <td className="px-6 py-4"><span className="px-2.5 py-1 bg-slate-100 rounded-md font-medium">{userHabitsCount}개</span></td>
                        <td className="px-6 py-4 text-slate-500">{lastActive}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-6">
          <form onSubmit={handleCreateUser} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col sm:flex-row items-end gap-4">
            <div className="flex-1 w-full">
              <label className="block text-sm font-bold text-slate-700 mb-2">새 사용자 코드 발급</label>
              <input type="text" value={newUserCode} onChange={e => setNewUserCode(e.target.value)} placeholder="예: NEWUSER_01" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-800 transition-all uppercase font-medium" required />
            </div>
            <button type="submit" disabled={isProcessing} className="w-full sm:w-auto px-8 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-colors disabled:opacity-70 flex items-center justify-center">
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Plus className="w-5 h-5 mr-1" />} 생성
            </button>
          </form>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <h3 className="font-bold text-slate-800 mb-5">등록된 사용자 명단</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {users.map(user => (
                <div key={user.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-2xl bg-slate-50 hover:bg-white hover:shadow-sm transition-all group">
                  <span className="font-bold text-slate-700">{user.user_code}</span>
                  <button onClick={() => setDeleteModal({ isOpen: true, userCode: user.user_code })} className="text-slate-300 hover:text-red-500 p-2 rounded-xl hover:bg-red-50 transition-colors opacity-100 sm:opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'assign' && (
        <form onSubmit={handleAssignHabit} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6 max-w-2xl mx-auto">
          <div className="border-b border-slate-100 pb-4 mb-4">
            <h3 className="font-bold text-xl text-slate-800">특정 사용자에게 습관 대리 부여</h3>
            <p className="text-sm text-slate-500 mt-1">관리자 권한으로 대상 유저의 리스트에 직접 미션을 추가합니다.</p>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">대상 사용자 선택</label>
            <select value={assignForm.user_code} onChange={e => setAssignForm({...assignForm, user_code: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white" required>
              <option value="">-- 사용자 코드를 선택하세요 --</option>
              {users.map(u => <option key={u.id} value={u.user_code}>{u.user_code}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">부여할 습관 명칭</label>
            <input type="text" value={assignForm.title} onChange={e => setAssignForm({...assignForm, title: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200" placeholder="예: 관리자 특별 미션" required />
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-bold text-slate-700 mb-2">카테고리</label>
              <input type="text" value={assignForm.category} onChange={e => setAssignForm({...assignForm, category: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200" placeholder="예: 공통 과제" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-slate-700 mb-2">기록 방식</label>
              <select value={assignForm.check_type} onChange={e => setAssignForm({...assignForm, check_type: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white">
                <option value="boolean">O/X 달성</option>
                <option value="numeric">수치 기입</option>
              </select>
            </div>
          </div>
          {assignForm.check_type === 'numeric' && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">단위</label>
              <input type="text" value={assignForm.unit} onChange={e => setAssignForm({...assignForm, unit: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200" required={assignForm.check_type === 'numeric'} placeholder="예: 분, 권, 회" />
            </div>
          )}
          <div className="pt-4">
            <button type="submit" disabled={isProcessing || !assignForm.user_code} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-emerald-700 shadow-md shadow-emerald-200 transition-all flex justify-center items-center disabled:opacity-70 disabled:cursor-not-allowed">
              {isProcessing ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : null} 강제 부여 실행
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// ==========================================
// 메인 App 컴포넌트
// ==========================================
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('daily'); 
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);

  // Supabase 실시간 데이터 및 에러 상태 훅 로드
  const { users, habits, habitLogs, api, isLoading, fetchAllData, errorMsg, setErrorMsg } = useSupabaseData();

  const handleLogin = async (code) => {
    const upperCode = code.toUpperCase();
    setIsAuthProcessing(true);

    try {
      if (upperCode === ADMIN_CODE) {
        setIsAdmin(true);
        setCurrentUser(ADMIN_CODE);
      } else {
        // 기존 DB에 유저가 있는지 확인
        const existingUser = users.find(u => u.user_code === upperCode);
        if (!existingUser) {
          // 없으면 새로 Supabase에 Insert
          await api.addUser(upperCode);
        }
        setIsAdmin(false);
        setCurrentUser(upperCode);
      }
    } catch (err) {
       console.error("인증 처리 중 에러:", err);
       setErrorMsg("로그인 처리 중 문제가 발생했습니다.");
       setTimeout(() => setErrorMsg(''), 5000);
    } finally {
      setIsAuthProcessing(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsAdmin(false);
    setActiveTab('daily');
    // 로그아웃 시 최신 데이터로 리프레시
    fetchAllData();
  };

  // 에러 발생 시 최상단에 토스트 알림 노출
  const ErrorBanner = () => <ErrorToast message={errorMsg} onClose={() => setErrorMsg('')} />;

  if (!currentUser) {
    return (
      <>
        <ErrorBanner />
        <AuthScreen onLogin={handleLogin} isAuthProcessing={isAuthProcessing || isLoading} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-emerald-200 selection:text-emerald-900">
      <ErrorBanner />
      
      {/* 헤더 네비게이션 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${isAdmin ? 'bg-slate-800 text-white' : 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white'}`}>
              {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
            </div>
            <span className="font-bold text-lg hidden sm:block tracking-tight">
              {isAdmin ? '마스터 관제 센터' : 'Habit Tracker'}
            </span>
          </div>
          
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="bg-slate-100 px-3 py-1.5 rounded-lg flex items-center border border-slate-200">
              <span className="text-xs text-slate-500 mr-2 hidden sm:inline">접속계정:</span>
              <span className={`text-sm font-bold ${isAdmin ? 'text-blue-600' : 'text-emerald-600'}`}>{currentUser}</span>
            </div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors p-2 rounded-xl hover:bg-red-50 flex items-center" title="로그아웃">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">
        {isAdmin ? (
          <AdminDashboard data={{users, habits, habitLogs}} api={api} isLoading={isLoading} />
        ) : (
          <>
            <div className="flex justify-center mb-8">
              <div className="bg-slate-200/50 p-1.5 rounded-2xl inline-flex w-full sm:w-auto">
                <button 
                  onClick={() => setActiveTab('daily')} 
                  className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center transition-all ${activeTab === 'daily' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Target className="w-4.5 h-4.5 mr-2" /> 일일 기록
                </button>
                <button 
                  onClick={() => setActiveTab('stats')} 
                  className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center transition-all ${activeTab === 'stats' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <BarChart3 className="w-4.5 h-4.5 mr-2" /> 분석 및 통계
                </button>
              </div>
            </div>

            {activeTab === 'daily' ? (
              <UserHabitTracker userCode={currentUser} habits={habits} logs={habitLogs} api={api} isLoading={isLoading} />
            ) : (
              <UserHabitStats userCode={currentUser} habits={habits} logs={habitLogs} />
            )}
          </>
        )}
      </main>
    </div>
  );
}