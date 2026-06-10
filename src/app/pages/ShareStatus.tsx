import { ArrowLeft, CheckCircle2, Copy, Send } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useApp } from '../store/appStore';

export function ShareStatus() {
  const navigate = useNavigate();
  const { destination } = useApp();
  const destName = destination?.name ?? '목적지';

  // 공유 메시지 (보호자에게 전달될 안심귀가 상태)
  const shareMessage = `[부엉이 안심귀가] ${destName}(으)로 이동 중입니다. 실시간 위치를 확인해 주세요.`;
  const shareUrl = `${window.location.origin}/share`;
  const shareText = `${shareMessage}\n${shareUrl}`;

  const handleKakao = async () => {
    // 카카오 SDK 연동 전: Web Share API 우선, 미지원 시 클립보드 폴백
    if (navigator.share) {
      try {
        await navigator.share({ title: '부엉이 안심귀가', text: shareMessage, url: shareUrl });
        return;
      } catch {
        return; // 사용자가 공유 취소
      }
    }
    await copyToClipboard('공유 메시지를 복사했어요. 카카오톡에 붙여넣어 보내세요.');
  };

  const handleSms = () => {
    window.location.href = `sms:?body=${encodeURIComponent(shareText)}`;
  };

  const copyToClipboard = async (successMsg: string) => {
    try {
      await navigator.clipboard.writeText(shareText);
      toast(successMsg, {
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
        duration: 2500,
      });
    } catch {
      toast.error('복사에 실패했어요. 다시 시도해 주세요.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-800">
      <header className="px-4 py-4 pt-6 flex items-center justify-between border-b border-slate-700 bg-slate-800">
        <button onClick={() => navigate(-1)} aria-label="뒤로 가기" className="p-2 text-slate-300 hover:text-slate-50 rounded-full hover:bg-slate-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-slate-50">보호자 공유</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 p-6 flex flex-col gap-8">
        <div className="bg-slate-700 rounded-[32px] p-6 border border-slate-600 shadow-sm">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-600">
            <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-slate-50 font-bold text-xl mb-1">안심귀가 중입니다</h2>
              <p className="text-slate-300 text-sm font-medium">실시간 위치를 공유합니다</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-medium">목적지</span>
              <span className="text-slate-50 font-bold">{destName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-medium">예상 도착</span>
              <span className="text-blue-300 font-bold">오후 11:30 (24분 남음)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-medium">상태</span>
              <span className="text-emerald-300 font-bold bg-emerald-500/20 px-3 py-1.5 rounded-full text-sm">이동 중</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-slate-300 font-medium px-2 mb-1">공유 방법 선택</h3>

          <button
            onClick={handleKakao}
            className="w-full bg-[#FEE500] text-[#191919] rounded-[20px] p-5 flex items-center justify-center font-bold text-lg hover:bg-[#F4DC00] transition-colors active:scale-95 shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6 mr-2 fill-current">
              <path d="M12 3c-5.523 0-10 3.51-10 7.846 0 2.808 1.83 5.26 4.654 6.6l-1.187 4.318a.385.385 0 0 0 .584.417l5.076-3.376A10.3 10.3 0 0 0 12 18.692c5.523 0 10-3.51 10-7.846C22 6.51 17.523 3 12 3" />
            </svg>
            카카오톡으로 공유
          </button>

          <button
            onClick={handleSms}
            className="w-full bg-slate-700 text-blue-300 border border-slate-600 rounded-[20px] p-5 flex items-center justify-center font-bold text-lg hover:bg-slate-600 transition-colors active:scale-95 shadow-sm"
          >
            <Send className="w-5 h-5 mr-2" />
            문자 메시지(SMS)
          </button>

          <button
            onClick={() => copyToClipboard('공유 링크를 복사했어요.')}
            className="w-full bg-transparent border border-slate-600 text-slate-200 rounded-[20px] p-5 flex items-center justify-center font-medium text-lg hover:bg-slate-700 transition-colors shadow-sm active:scale-95"
          >
            <Copy className="w-5 h-5 mr-2 text-slate-300" />
            링크 복사하기
          </button>
        </div>
      </div>
    </div>
  );
}
