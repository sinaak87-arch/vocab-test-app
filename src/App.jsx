import React, { useState, useMemo, useEffect } from 'react';
import {
  Link2,
  Printer,
  Eye,
  EyeOff,
  Shuffle,
  BookOpen,
  Check,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Loader2,
} from 'lucide-react';

// 구글 시트 URL을 CSV export URL로 변환
function convertToCsvUrl(url) {
  // 형식: https://docs.google.com/spreadsheets/d/{ID}/edit?...
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;
  const sheetId = match[1];
  // gid 추출 (특정 시트 탭)
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

// CSV 파싱 (간단한 따옴표 처리 포함)
function parseCSV(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === ',' && !inQuote) {
        cells.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

const STORAGE_KEY = 'vocab_test_maker_state';

export default function App() {
  const [sheetUrl, setSheetUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [words, setWords] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedUnits, setSelectedUnits] = useState(new Set());
  const [questionCount, setQuestionCount] = useState(20);
  const [testType, setTestType] = useState('eng-kor');
  const [generatedTest, setGeneratedTest] = useState(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [academyName, setAcademyName] = useState('');
  const [className, setClassName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [testTitle, setTestTitle] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loadedSheetTitle, setLoadedSheetTitle] = useState('');

  // 페이지 로드 시 저장된 상태 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.sheetUrl) setSheetUrl(data.sheetUrl);
        if (data.academyName) setAcademyName(data.academyName);
        if (data.className) setClassName(data.className);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // 학원/클래스 정보 자동 저장
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sheetUrl, academyName, className })
      );
    } catch (e) {
      // ignore
    }
  }, [sheetUrl, academyName, className]);

  // 구글 시트에서 단어 불러오기
  const loadFromSheet = async () => {
    setErrorMsg('');
    if (!sheetUrl.trim()) {
      setErrorMsg('구글 스프레드시트 URL을 입력해주세요.');
      return;
    }
    const csvUrl = convertToCsvUrl(sheetUrl.trim());
    if (!csvUrl) {
      setErrorMsg(
        '올바른 구글 스프레드시트 URL이 아닙니다. (예: https://docs.google.com/spreadsheets/d/...)'
      );
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(csvUrl);
      if (!response.ok) {
        if (response.status === 404 || response.status === 401 || response.status === 403) {
          setErrorMsg(
            '시트에 접근할 수 없습니다. [공유] → [링크가 있는 모든 사용자]로 설정했는지 확인해주세요.'
          );
        } else {
          setErrorMsg(`시트를 불러올 수 없습니다 (오류 ${response.status}).`);
        }
        setLoading(false);
        return;
      }
      const text = await response.text();
      const rows = parseCSV(text);

      const parsed = [];
      rows.forEach((row) => {
        if (!row || row.length < 3) return;
        const unit = row[0];
        const eng = row[1];
        const kor = row[2];
        if (unit && eng && kor && unit.toString().trim() && eng.trim() && kor.trim()) {
          parsed.push({
            unit: unit.toString().trim(),
            eng: eng.trim(),
            kor: kor.trim(),
          });
        }
      });

      if (parsed.length === 0) {
        setErrorMsg(
          '시트에서 단어를 찾을 수 없습니다. A열: 단원, B열: 영어, C열: 한글뜻 형식인지 확인해주세요.'
        );
        setLoading(false);
        return;
      }

      const uniqueUnits = [...new Set(parsed.map((w) => w.unit))].sort((a, b) => {
        const na = parseFloat(a),
          nb = parseFloat(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });

      setWords(parsed);
      setUnits(uniqueUnits);
      setSelectedUnits(new Set(uniqueUnits));
      setGeneratedTest(null);
      setLoadedSheetTitle(`${parsed.length}개 단어 · ${uniqueUnits.length}개 단원`);
    } catch (err) {
      setErrorMsg('네트워크 오류가 발생했습니다: ' + err.message);
    }
    setLoading(false);
  };

  const toggleUnit = (unit) => {
    const next = new Set(selectedUnits);
    if (next.has(unit)) next.delete(unit);
    else next.add(unit);
    setSelectedUnits(next);
  };

  const toggleAllUnits = () => {
    if (selectedUnits.size === units.length) setSelectedUnits(new Set());
    else setSelectedUnits(new Set(units));
  };

  const availableWords = useMemo(() => {
    return words.filter((w) => selectedUnits.has(w.unit));
  }, [words, selectedUnits]);

  const generateTest = () => {
    setErrorMsg('');
    if (words.length === 0) {
      setErrorMsg('먼저 구글 시트에서 단어를 불러와주세요.');
      return;
    }
    if (selectedUnits.size === 0) {
      setErrorMsg('출제 범위(단원)를 1개 이상 선택해주세요.');
      return;
    }
    if (availableWords.length === 0) {
      setErrorMsg('선택한 범위에 단어가 없습니다.');
      return;
    }
    const count = Math.min(questionCount, availableWords.length);
    const arr = [...availableWords];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setGeneratedTest({
      items: arr.slice(0, count),
      type: testType,
      createdAt: new Date(),
    });
    setShowAnswers(false);
    // 시험지 영역으로 스크롤
    setTimeout(() => {
      document
        .getElementById('test-preview')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const reshuffle = () => {
    if (!generatedTest) return;
    const arr = [...generatedTest.items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setGeneratedTest({ ...generatedTest, items: arr });
  };

  const handlePrint = () => window.print();

  const selectedRangeLabel = useMemo(() => {
    if (selectedUnits.size === 0) return '범위 미선택';
    if (selectedUnits.size === units.length) return '전체 단원';
    const sorted = [...selectedUnits].sort((a, b) => {
      const na = parseFloat(a),
        nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
    if (sorted.length <= 4) return sorted.map((u) => `${u}`).join(', ');
    return `${sorted[0]} 외 ${sorted.length - 1}개 단원`;
  }, [selectedUnits, units]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Nanum+Myeongjo:wght@400;700;800&display=swap');
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; border: none !important; padding: 0 !important; margin: 0 !important; }
          .print-only { display: block !important; }
          @page { margin: 1.5cm; }
        }
        .print-only { display: none; }
        .test-line { border-bottom: 1px solid #1c1917; min-height: 1.6rem; }
      `}</style>

      <header className="no-print bg-gradient-to-r from-violet-700 via-purple-700 to-fuchsia-700 text-white">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <BookOpen className="w-6 h-6" strokeWidth={2.2} />
            </div>
            <div>
              <h1
                className="text-2xl font-black tracking-tight"
                style={{ fontFamily: "'Nanum Myeongjo', serif" }}
              >
                어휘 시험 출제기
              </h1>
              <p className="text-xs text-violet-100/80 mt-0.5">
                구글 스프레드시트로 만드는 단어 시험지
              </p>
            </div>
          </div>
          {words.length > 0 && (
            <div className="hidden md:flex items-center gap-2 text-xs bg-white/10 px-3 py-1.5 rounded-full">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{loadedSheetTitle}</span>
            </div>
          )}
        </div>
      </header>

      <main className="no-print max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* STEP 01 - 구글 시트 URL 입력 */}
        <section className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-3 border-b border-stone-200 flex items-center gap-3">
            <span className="bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded">
              STEP 01
            </span>
            <h2 className="font-bold text-stone-800">구글 스프레드시트 연결</h2>
          </div>
          <div className="p-6">
            <label className="text-sm font-bold text-stone-700 block mb-2">
              📊 구글 시트 URL
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadFromSheet()}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-violet-500"
                />
              </div>
              <button
                onClick={loadFromSheet}
                disabled={loading}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-stone-300 text-white font-bold rounded-lg flex items-center gap-2 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중
                  </>
                ) : words.length > 0 ? (
                  <>
                    <RefreshCw className="w-4 h-4" /> 새로고침
                  </>
                ) : (
                  <>불러오기</>
                )}
              </button>
            </div>

            {words.length > 0 && (
              <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span className="font-bold">{loadedSheetTitle} 로드 완료</span>
                <span className="text-xs text-emerald-600 ml-auto">
                  시트 내용을 수정한 뒤에는 [새로고침]을 눌러주세요
                </span>
              </div>
            )}

            {errorMsg && !loading && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <details className="mt-4 text-xs text-stone-500">
              <summary className="cursor-pointer font-medium hover:text-stone-700">
                💡 시트 형식 안내 (클릭해서 펼치기)
              </summary>
              <div className="mt-3 bg-stone-50 rounded-lg p-4 space-y-2">
                <p>
                  <strong className="text-stone-700">시트 형식:</strong> 첫 행부터 바로 데이터
                  입력 (헤더 행 없이)
                </p>
                <table className="text-xs border border-stone-200 mt-2">
                  <thead className="bg-stone-100">
                    <tr>
                      <th className="px-3 py-1 border-r border-stone-200">A열 (단원)</th>
                      <th className="px-3 py-1 border-r border-stone-200">B열 (영어)</th>
                      <th className="px-3 py-1">C열 (한글뜻)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-1 border-t border-r border-stone-200">19</td>
                      <td className="px-3 py-1 border-t border-r border-stone-200">damp</td>
                      <td className="px-3 py-1 border-t border-stone-200">습기 찬</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1 border-t border-r border-stone-200">19</td>
                      <td className="px-3 py-1 border-t border-r border-stone-200">thick</td>
                      <td className="px-3 py-1 border-t border-stone-200">짙은</td>
                    </tr>
                  </tbody>
                </table>
                <p className="pt-2">
                  <strong className="text-stone-700">공유 설정:</strong> 시트 우측 상단 [공유] →
                  "링크가 있는 모든 사용자" → "뷰어"로 변경
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* STEP 02 - 출제 옵션 */}
        {words.length > 0 && (
          <section className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="bg-gradient-to-r from-violet-50 to-fuchsia-50 px-6 py-3 border-b border-stone-200 flex items-center gap-3">
              <span className="bg-violet-600 text-white text-xs font-bold px-2.5 py-1 rounded">
                STEP 02
              </span>
              <h2 className="font-bold text-stone-800">출제 범위 / 옵션 선택</h2>
            </div>

            <div className="p-6 grid md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-bold text-stone-700">📚 시험 범위 (단원)</label>
                  <button
                    onClick={toggleAllUnits}
                    className="text-xs text-violet-600 hover:text-violet-800 font-medium"
                  >
                    {selectedUnits.size === units.length ? '전체 해제' : '전체 선택'}
                  </button>
                </div>
                <div className="border border-stone-200 rounded-xl p-3 max-h-60 overflow-y-auto bg-stone-50/50">
                  <div className="grid grid-cols-3 gap-2">
                    {units.map((unit) => {
                      const checked = selectedUnits.has(unit);
                      const cnt = words.filter((w) => w.unit === unit).length;
                      return (
                        <button
                          key={unit}
                          onClick={() => toggleUnit(unit)}
                          className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                            checked
                              ? 'bg-violet-600 border-violet-600 text-white shadow-sm'
                              : 'bg-white border-stone-200 text-stone-700 hover:border-violet-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span>단원 {unit}</span>
                            <span
                              className={`text-[10px] ${
                                checked ? 'text-violet-100' : 'text-stone-400'
                              }`}
                            >
                              {cnt}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-stone-500 mt-2">
                  선택된 범위:{' '}
                  <span className="font-semibold text-violet-700">{selectedRangeLabel}</span>
                  {' · '}
                  <span className="font-semibold text-stone-700">
                    {availableWords.length}개 단어 사용 가능
                  </span>
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-sm font-bold text-stone-700 block mb-2">
                    🎯 출제 단어 개수
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQuestionCount(Math.max(1, questionCount - 5))}
                      className="w-9 h-9 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={questionCount}
                      onChange={(e) =>
                        setQuestionCount(Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="flex-1 text-center text-lg font-bold border border-stone-300 rounded-lg py-1.5 focus:outline-none focus:border-violet-500"
                      min={1}
                      max={availableWords.length}
                    />
                    <button
                      onClick={() =>
                        setQuestionCount(Math.min(availableWords.length, questionCount + 5))
                      }
                      className="w-9 h-9 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold"
                    >
                      +
                    </button>
                    <button
                      onClick={() => setQuestionCount(availableWords.length)}
                      className="px-3 h-9 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-bold"
                    >
                      MAX
                    </button>
                  </div>
                  <p className="text-xs text-stone-500 mt-1.5">
                    최대 {availableWords.length}개까지 출제 가능
                  </p>
                </div>

                <div>
                  <label className="text-sm font-bold text-stone-700 block mb-2">
                    🔄 출제 유형
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setTestType('eng-kor')}
                      className={`px-4 py-3 rounded-xl border-2 transition-all ${
                        testType === 'eng-kor'
                          ? 'bg-violet-50 border-violet-500 text-violet-900'
                          : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
                      }`}
                    >
                      <div className="font-bold text-sm">영어 → 한글</div>
                      <div className="text-[11px] mt-0.5 opacity-70">영단어를 보고 뜻 쓰기</div>
                    </button>
                    <button
                      onClick={() => setTestType('kor-eng')}
                      className={`px-4 py-3 rounded-xl border-2 transition-all ${
                        testType === 'kor-eng'
                          ? 'bg-violet-50 border-violet-500 text-violet-900'
                          : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
                      }`}
                    >
                      <div className="font-bold text-sm">한글 → 영어</div>
                      <div className="text-[11px] mt-0.5 opacity-70">뜻을 보고 영단어 쓰기</div>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-stone-50/60 px-6 py-5 border-t border-stone-100">
              <label className="text-sm font-bold text-stone-700 block mb-3">
                📝 시험지 정보 (선택)
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  value={academyName}
                  onChange={(e) => setAcademyName(e.target.value)}
                  placeholder="학원명"
                  className="px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-violet-400"
                />
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="클래스명"
                  className="px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-violet-400"
                />
                <input
                  type="text"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  placeholder="시험지명"
                  className="px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-violet-400"
                />
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="이름 (비워두면 빈칸)"
                  className="px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-violet-400"
                />
              </div>
            </div>

            <div className="px-6 pb-6 pt-4">
              <button
                onClick={generateTest}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                시험지 만들기
              </button>
            </div>
          </section>
        )}

        {/* STEP 03 - 미리보기 */}
        {generatedTest && (
          <section
            id="test-preview"
            className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm"
          >
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-3 border-b border-stone-200 flex items-center gap-3 flex-wrap">
              <span className="bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded">
                STEP 03
              </span>
              <h2 className="font-bold text-stone-800">미리보기 & 인쇄</h2>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowAnswers(!showAnswers)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-stone-200 hover:border-stone-300 text-sm font-medium flex items-center gap-1.5"
                >
                  {showAnswers ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showAnswers ? '정답 숨기기' : '정답 보기'}
                </button>
                <button
                  onClick={reshuffle}
                  className="px-3 py-1.5 rounded-lg bg-white border border-stone-200 hover:border-stone-300 text-sm font-medium flex items-center gap-1.5"
                >
                  <Shuffle className="w-4 h-4" /> 순서 섞기
                </button>
                <button
                  onClick={handlePrint}
                  className="px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> 인쇄하기
                </button>
              </div>
            </div>

            <div className="p-6 bg-stone-100">
              <TestPaper
                test={generatedTest}
                showAnswers={showAnswers}
                academyName={academyName}
                className={className}
                studentName={studentName}
                testTitle={testTitle}
                selectedRangeLabel={selectedRangeLabel}
              />
            </div>
          </section>
        )}

        {words.length === 0 && !loading && (
          <div className="text-center py-12 text-stone-500 text-sm">
            <p>👆 위에서 구글 시트 URL을 입력하고 [불러오기]를 누르면 시작할 수 있어요.</p>
            <p className="mt-1 text-xs text-stone-400">
              시트 형식: A열에 단원번호, B열에 영어 단어, C열에 한글 뜻
            </p>
          </div>
        )}
      </main>

      {generatedTest && (
        <div className="print-only">
          <TestPaper
            test={generatedTest}
            showAnswers={showAnswers}
            academyName={academyName}
            className={className}
            studentName={studentName}
            testTitle={testTitle}
            selectedRangeLabel={selectedRangeLabel}
            isPrint
          />
        </div>
      )}
    </div>
  );
}

function TestPaper({
  test,
  showAnswers,
  academyName,
  className,
  studentName,
  testTitle,
  selectedRangeLabel,
  isPrint,
}) {
  const isEngKor = test.type === 'eng-kor';

  return (
    <div
      className={`print-page bg-white ${
        isPrint ? 'p-10' : 'mx-auto max-w-3xl shadow-lg p-10 rounded-lg'
      }`}
      style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
    >
      <div className="border-b-2 border-stone-900 pb-3 mb-5">
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="text-xs text-stone-500 mb-0.5">VOCABULARY TEST</div>
            <h1
              className="text-2xl font-black text-stone-900"
              style={{ fontFamily: "'Nanum Myeongjo', serif" }}
            >
              {testTitle || `어휘 시험 (${selectedRangeLabel})`}
            </h1>
            <div className="text-sm text-stone-600 mt-1">
              {isEngKor
                ? '※ 다음 영어 단어의 우리말 뜻을 쓰시오.'
                : '※ 다음 우리말에 해당하는 영어 단어를 쓰시오.'}
            </div>
          </div>
          <div className="text-xs text-stone-700 border border-stone-300 rounded p-2 min-w-[160px]">
            {academyName && (
              <div className="pb-1 border-b border-stone-200 mb-1">
                <span className="text-stone-500 mr-1.5">학원</span>
                {academyName}
              </div>
            )}
            {className && (
              <div className="pb-1 border-b border-stone-200 mb-1">
                <span className="text-stone-500 mr-1.5">클래스</span>
                {className}
              </div>
            )}
            <div>
              <span className="text-stone-500 mr-1.5">이름</span>
              {studentName || '________________'}
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center mt-2 text-[11px] text-stone-500">
          <span>
            총 {test.items.length}문항 · 출제 유형: {isEngKor ? '영어→한글' : '한글→영어'}
          </span>
          <span>점수:        / {test.items.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        {test.items.map((item, i) => {
          const question = isEngKor ? item.eng : item.kor;
          const answer = isEngKor ? item.kor : item.eng;
          return (
            <div key={i} className="flex items-baseline gap-2 py-1.5">
              <span className="font-bold text-stone-700 w-7 text-right">{i + 1}.</span>
              <div className="flex-1">
                <div className="font-medium text-stone-900 text-[15px]">{question}</div>
                <div
                  className={`test-line mt-1 ${
                    showAnswers ? 'text-red-600 font-medium' : ''
                  }`}
                >
                  {showAnswers ? answer : '\u00A0'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 pt-3 border-t border-stone-200 text-[10px] text-stone-400 text-center">
        Generated by 어휘 시험 출제기 · {test.createdAt.toLocaleDateString('ko-KR')}
      </div>
    </div>
  );
}
