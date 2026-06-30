import { ArrowLeft, Phone, Plus, X, UserCircle2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { useApp, MAX_CONTACTS } from '../store/appStore';

export function EmergencyContact() {
  const navigate = useNavigate();
  const { contacts, addContact, removeContact } = useApp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const resetForm = () => {
    setName('');
    setPhone('');
    setAdding(false);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) {
      toast.error('이름과 전화번호를 모두 입력해 주세요.');
      return;
    }
    // 위급 시 실제 발신 가능한 번호인지 검증. 숫자 외 입력(이름 오기재 등)이 등록되면
    // 긴급 도움 시트의 tel: 링크가 빈 번호가 되어 전화가 걸리지 않는다.
    const digits = trimmedPhone.replace(/[^0-9]/g, '');
    if (digits.length < 9 || digits.length > 11) {
      toast.error('올바른 전화번호를 입력해 주세요. (예: 010-1234-5678)');
      return;
    }
    const { added, persisted } = addContact(trimmedName, trimmedPhone);
    if (!added) {
      toast.error(`긴급 연락처는 최대 ${MAX_CONTACTS}명까지 등록할 수 있어요.`);
      return;
    }
    if (!persisted) {
      // in-memory에는 추가됐지만 저장 실패 → 거짓 "등록했어요" 금지, 비영속 사실을 정직 고지
      toast.error('저장 공간이 부족해 연락처를 저장하지 못했어요. 새로고침하면 사라질 수 있어요. 브라우저 설정(프라이빗 모드 등)을 확인해 주세요.');
      resetForm();
      return;
    }
    toast(`${trimmedName} 연락처를 등록했어요.`);
    resetForm();
  };

  return (
    <div className="flex flex-col h-full bg-slate-800">
      <header className="px-4 py-4 pt-6 flex items-center justify-between border-b border-slate-700 bg-slate-800">
        <button onClick={() => navigate(-1)} aria-label="뒤로 가기" className="p-2 text-slate-300 hover:text-slate-50 rounded-full hover:bg-slate-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-slate-50">긴급 연락처 관리</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-8 pb-24 space-y-6">
        <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-[20px] flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-slate-300 text-sm leading-relaxed">
            위급 상황에서 길안내 화면의 '긴급 도움'을 누르면 112 전화, 보호자에게 바로 전화, 위치 링크가 담긴 긴급 메시지 공유를 한 번에 할 수 있어요. 여기에 보호자를 등록해 두세요. (최대 {MAX_CONTACTS}명)
          </p>
        </div>

        <div className="space-y-4">
          {contacts.length === 0 && !adding && (
            <div className="text-center text-slate-400 text-sm py-6">
              등록된 긴급 연락처가 없어요.
            </div>
          )}

          {contacts.map((contact) => (
            <div key={contact.id} className="bg-slate-700 border border-slate-600 rounded-[24px] p-5 flex items-center gap-4 shadow-sm relative group overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 w-1 bg-red-400 rounded-l-[24px]"></div>
              <div className="w-12 h-12 bg-slate-800 border border-slate-600 rounded-full flex items-center justify-center text-slate-400">
                <UserCircle2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="text-slate-50 font-bold text-lg">{contact.name}</div>
                <div className="text-slate-400 text-sm mt-0.5 font-medium tracking-wide flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  {contact.phone}
                </div>
              </div>
              <button
                onClick={() => {
                  // 삭제 미영속(프라이빗 모드 등) 시 거짓 "삭제됨" 금지 — 새로고침 재출현 가능성을 정직 고지.
                  const persisted = removeContact(contact.id);
                  if (!persisted) {
                    toast.error('저장 공간 문제로 삭제가 저장되지 않았어요. 새로고침하면 다시 보일 수 있어요. 브라우저 설정(프라이빗 모드 등)을 확인해 주세요.');
                  }
                }}
                aria-label={`${contact.name} 삭제`}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ))}

          {adding ? (
            <form onSubmit={handleAdd} className="bg-slate-700 border border-slate-600 rounded-[24px] p-5 space-y-3 shadow-sm">
              <input
                autoFocus
                type="text"
                placeholder="이름 (예: 엄마)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                className="w-full bg-slate-800 border border-slate-600 rounded-[16px] px-4 py-3 text-slate-50 placeholder:text-slate-500 outline-none focus:border-blue-400 transition-colors"
              />
              <input
                type="tel"
                inputMode="tel"
                placeholder="전화번호 (예: 010-1234-5678)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-[16px] px-4 py-3 text-slate-50 placeholder:text-slate-500 outline-none focus:border-blue-400 transition-colors"
              />
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="secondary" className="flex-1 rounded-[16px]" onClick={resetForm}>
                  취소
                </Button>
                <Button type="submit" className="flex-1 rounded-[16px]">
                  등록
                </Button>
              </div>
            </form>
          ) : (
            contacts.length < MAX_CONTACTS && (
              <button
                onClick={() => setAdding(true)}
                className="w-full bg-slate-700/50 border border-slate-600 border-dashed rounded-[24px] p-6 flex flex-col items-center justify-center gap-3 hover:bg-slate-700 transition-colors group"
              >
                <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="text-slate-300 font-bold">새 연락처 추가</span>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
