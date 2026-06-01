import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Download, 
  FileText, 
  User, 
  Calendar, 
  Clock, 
  CreditCard, 
  StickyNote, 
  Save,
  CheckCircle2,
  ChevronRight,
  History,
  Copy,
  CheckSquare,
  Check,
  AlertCircle,
  Search,
  X,
  TrendingUp,
  Receipt,
  DollarSign,
  PieChart,
  ChevronDown,
  ChevronUp,
  Percent
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

interface Student {
  id: string;
  name: string;
  parentName: string;
  email: string;
  phone: string;
  rate: number;
  credit?: number;
}

interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
  paymentMethod?: string;
  importBatchId?: string;
}

interface CsvImportRecord {
  batchId: string;
  fileName: string;
  importDate: string;
  invoicesCount: number;
  expensesCount: number;
}

interface Lesson {
  id: string;
  date: string;
  time: string;
  duration: string;
  type: 'Single' | '6-Week Cycle' | 'Credit';
  cycleDates?: string[];
  name?: string;
  creditAmount?: number;
  customPrice?: number;
}

interface InvoiceData {
  id: string;
  studentId: string;
  studentName: string;
  parentName: string;
  email: string;
  lessons: Lesson[];
  dueDate: string;
  billingCycle: string;
  notes: string;
  paymentMethod: string;
  amount: number;
  coachName: string;
  coachEmail: string;
  coachAbn: string;
  term: string;
  rate: number;
  appliedCredit?: number;
  savedAt?: string;
  importBatchId?: string;
}

const DEFAULT_COACH_NAME = "Skating Coach";
const DEFAULT_COACH_EMAIL = "coach@example.com";
const DEFAULT_COACH_ABN = "28181651474";

type View = 'invoice' | 'students' | 'tax';

export default function App() {
  const [view, setView] = useState<View>('invoice');
  const [students, setStudents] = useState<Student[]>([]);
  const [invoiceHistory, setInvoiceHistory] = useState<InvoiceData[]>([]);
  const [historyScope, setHistoryScope] = useState<'date' | 'all'>('date');
  const [historySearch, setHistorySearch] = useState('');

  // Google Drive Sync States
  const [googleClientId, setGoogleClientId] = useState<string>(() => localStorage.getItem('skating_google_client_id') || '');
  const [googleClientSecret, setGoogleClientSecret] = useState<string>(() => localStorage.getItem('skating_google_client_secret') || '');
  const [googleToken, setGoogleToken] = useState<string | null>(() => localStorage.getItem('skating_google_token') || null);
  const [googleTokenExpiry, setGoogleTokenExpiry] = useState<number>(() => Number(localStorage.getItem('skating_google_token_expiry')) || 0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => localStorage.getItem('skating_last_sync_time') || '');
  const [showGoogleConfig, setShowGoogleConfig] = useState(false);
  const [deviceUserCode, setDeviceUserCode] = useState<string>('');
  const [deviceVerificationUri, setDeviceVerificationUri] = useState<string>('');
  
  const getLocalDateString = (date: Date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedChecklistDate, setSelectedChecklistDate] = useState<string>(getLocalDateString());
  const [checklistSearch, setChecklistSearch] = useState('');

  const sortedFilteredStudents = [...students]
    .filter(s => s.name.toLowerCase().includes(checklistSearch.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const [newStudent, setNewStudent] = useState<Partial<Student>>({
    name: '',
    parentName: '',
    email: '',
    phone: '',
    rate: 110,
    credit: 0
  });
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  
  const [invoice, setInvoice] = useState<InvoiceData>({
    id: `INV-${Date.now()}`,
    studentId: '',
    studentName: '',
    parentName: '',
    email: '',
    lessons: [{
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      time: '10:00',
      duration: '60 min',
      type: 'Single',
      name: 'Private Ice Skating Lesson'
    }],
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    billingCycle: '6-week',
    notes: 'Thank you for the lesson!',
    paymentMethod: "Commonwealth Bank Australia\nWong Wing Nam\nBSB: 063-097\nAccount: 7273 8289\nPayID: 0405272775\nCash",
    amount: 110,
    coachName: DEFAULT_COACH_NAME,
    coachEmail: DEFAULT_COACH_EMAIL,
    coachAbn: DEFAULT_COACH_ABN,
    term: 'Term 1.1',
    rate: 110,
    appliedCredit: 0
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState<'checklist' | 'names' | null>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const taxCsvFileInputRef = useRef<HTMLInputElement>(null);

  // Tax and Expense Tracker states
  const [taxExpenses, setTaxExpenses] = useState<Expense[]>([]);
  const [taxPeriodType, setTaxPeriodType] = useState<'FY' | 'CY'>('FY');
  const [selectedTaxYear, setSelectedTaxYear] = useState<string>('');
  const [expandedTaxDay, setExpandedTaxDay] = useState<string | null>(null);
  
  // Sort and filter states
  const [expenseSearch, setExpenseSearch] = useState<string>('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('All');
  const [expenseSortBy, setExpenseSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [incomeSearch, setIncomeSearch] = useState<string>('');
  const [incomeSortBy, setIncomeSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [csvImportsHistory, setCsvImportsHistory] = useState<CsvImportRecord[]>([]);
  const [newExpense, setNewExpense] = useState<Partial<Omit<Expense, 'amount'> & { amount: string | number }>>({
    date: getLocalDateString(),
    category: 'Ice Hire',
    amount: '',
    description: '',
    paymentMethod: 'Cash'
  });

  // Load initial data from localStorage
  useEffect(() => {
    const savedStudents = localStorage.getItem('skating_students_v2');
    if (savedStudents) {
      setStudents(JSON.parse(savedStudents));
    } else {
      const oldStudents = localStorage.getItem('skating_students');
      if (oldStudents) {
        const parsed = JSON.parse(oldStudents);
        const migrated = parsed.map((s: any) => ({
          id: s.id,
          name: s.name,
          parentName: '',
          email: '',
          phone: '',
          rate: 110
        }));
        setStudents(migrated);
      }
    }
    
    const savedCoach = localStorage.getItem('skating_coach_info');
    if (savedCoach) {
      const { name, email, abn } = JSON.parse(savedCoach);
      setInvoice(prev => ({ 
        ...prev, 
        coachName: name || DEFAULT_COACH_NAME, 
        coachEmail: email || DEFAULT_COACH_EMAIL,
        coachAbn: abn || DEFAULT_COACH_ABN 
      }));
    }

    const savedHistory = localStorage.getItem('skating_invoice_history');
    if (savedHistory) {
      setInvoiceHistory(JSON.parse(savedHistory));
    }

    const savedExpenses = localStorage.getItem('skating_tax_expenses');
    if (savedExpenses) {
      setTaxExpenses(JSON.parse(savedExpenses));
    }

    const savedImports = localStorage.getItem('skating_csv_imports_history');
    if (savedImports) {
      setCsvImportsHistory(JSON.parse(savedImports));
    }

    // Google Drive Sync: Handle redirect token parameter on mount
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      const expiresIn = params.get('expires_in');
      
      if (token) {
        const expiryTime = Date.now() + (parseInt(expiresIn || '3600') * 1000);
        setGoogleToken(token);
        setGoogleTokenExpiry(expiryTime);
        localStorage.setItem('skating_google_token', token);
        localStorage.setItem('skating_google_token_expiry', String(expiryTime));
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        
        setSyncMessage('Google Account authorized successfully! Cloud is online. You can now Sync Now or Force Overwrite.');
      }
    }
  }, []);

  // Save CSV imports history to localStorage
  useEffect(() => {
    localStorage.setItem('skating_csv_imports_history', JSON.stringify(csvImportsHistory));
  }, [csvImportsHistory]);

  // Sync tax year with selected type
  useEffect(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-indexed, 4 = May
    
    if (taxPeriodType === 'FY') {
      if (currentMonth >= 6) {
        setSelectedTaxYear(`${currentYear}-${currentYear + 1}`);
      } else {
        setSelectedTaxYear(`${currentYear - 1}-${currentYear}`);
      }
    } else {
      setSelectedTaxYear(`${currentYear}`);
    }
  }, [taxPeriodType]);

  // Save students to localStorage
  useEffect(() => {
    localStorage.setItem('skating_students_v2', JSON.stringify(students));
  }, [students]);

  // Save expenses to localStorage
  useEffect(() => {
    localStorage.setItem('skating_tax_expenses', JSON.stringify(taxExpenses));
  }, [taxExpenses]);

  const addOrUpdateStudent = () => {
    if (!newStudent.name?.trim()) return;
    
    if (editingStudentId) {
      setStudents(students.map(s => s.id === editingStudentId ? { ...s, ...newStudent } as Student : s));
      setEditingStudentId(null);
    } else {
      const student: Student = {
        id: Date.now().toString(),
        name: newStudent.name.trim(),
        parentName: newStudent.parentName || '',
        email: newStudent.email || '',
        phone: newStudent.phone || '',
        rate: newStudent.rate || 110,
        credit: newStudent.credit || 0
      };
      setStudents([...students, student]);
    }
    
    setNewStudent({
      name: '',
      parentName: '',
      email: '',
      phone: '',
      rate: 110,
      credit: 0
    });
  };

  const editStudent = (student: Student) => {
    setNewStudent(student);
    setEditingStudentId(student.id);
  };

  const removeStudent = (id: string) => {
    setStudents(students.filter(s => s.id !== id));
  };

  const handleCsvImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const newStudents: Student[] = [];
      
      // Skip header if it exists
      const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;
      
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const [name, parentName, email, phone, rate, credit] = line.split(',').map(s => s.trim());
        if (name) {
          newStudents.push({
            id: (Date.now() + i).toString(),
            name,
            parentName: parentName || '',
            email: email || '',
            phone: phone || '',
            rate: parseFloat(rate) || 110,
            credit: parseFloat(credit) || 0
          });
        }
      }
      
      setStudents(prev => [...prev, ...newStudents]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const parseDurationToHours = (duration: string): number => {
    const clean = duration.toLowerCase().trim();
    const num = parseFloat(clean);
    if (isNaN(num)) return 1;
    if (clean.includes('min')) {
      return num / 60;
    }
    return num;
  };

  const getInvoiceVerification = (student: Student, dateStr?: string) => {
    const targetDate = dateStr || selectedChecklistDate;
    const todayInvoices = invoiceHistory.filter(inv => {
      const invDate = inv.savedAt 
        ? getLocalDateString(new Date(inv.savedAt))
        : getLocalDateString();
      return inv.studentName === student.name && invDate === targetDate;
    });
    if (todayInvoices.length === 0) {
      return { status: 'pending', message: 'Pending invoice creation', details: '' };
    }
    
    const inv = todayInvoices[0];
    const expectedRate = student.rate || 110;
    const expectedAmount = calculateTotalAmount(inv.lessons, expectedRate, inv.appliedCredit || 0);
    const actualAmount = inv.amount;
    const actualRate = inv.rate;
    
    const isRateCorrect = actualRate === expectedRate;
    const isAmountCorrect = Math.abs(actualAmount - expectedAmount) < 0.01;
    
    if (isRateCorrect && isAmountCorrect) {
      return { 
        status: 'correct', 
        message: 'Correct', 
        details: `Verified: ${inv.lessons.length} lesson(s) @ $${actualRate}/hr = $${actualAmount.toFixed(2)}` 
      };
    } else {
      const issues = [];
      if (!isRateCorrect) issues.push(`Rate differs ($${actualRate}/hr vs default $${expectedRate}/hr)`);
      if (!isAmountCorrect) issues.push(`Amount mismatch (Invoiced: $${actualAmount.toFixed(2)}, expected: $${expectedAmount.toFixed(2)})`);
      return { 
        status: 'mismatch', 
        message: 'Review Mismatch', 
        details: issues.join('; ') 
      };
    }
  };

  const getKeepChecklistText = () => {
    const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name));
    return sorted.map(student => {
      const targetInvoices = invoiceHistory.filter(inv => {
        const invDate = inv.savedAt 
          ? getLocalDateString(new Date(inv.savedAt))
          : getLocalDateString();
        return inv.studentName === student.name && invDate === selectedChecklistDate;
      });
      const isDone = targetInvoices.length > 0;
      if (isDone) {
        const inv = targetInvoices[0];
        const verification = getInvoiceVerification(student, selectedChecklistDate);
        const statusText = verification.status === 'correct' ? 'Correct ✓' : 'Mismatch ⚠';
        return `[x] ${student.name} (Invoiced: $${inv.amount.toFixed(2)} - ${statusText})`;
      } else {
        return `[ ] ${student.name} (Pending)`;
      }
    }).join('\n');
  };

  const getKeepNamesText = () => {
    return [...students].sort((a, b) => a.name.localeCompare(b.name)).map(s => s.name).join('\n');
  };

  const copyToClipboard = (text: string, type: 'checklist' | 'names') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(type);
      setTimeout(() => setCopySuccess(null), 3000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  const getGoogleCalendarUrl = (lesson: Lesson, studentName: string, coachName: string) => {
    if (lesson.type === 'Credit') return '';

    const isCycle = lesson.type === '6-Week Cycle';
    const durationMinutes = parseInt(lesson.duration) || 60;
    const startTime = lesson.time || '09:00';
    const [hours, minutes] = startTime.split(':').map(Number);
    
    // Parse date parts manually to avoid timezone displacement when doing new Date(string)
    const [year, month, day] = lesson.date.split('-').map(Number);
    
    const startDateObj = new Date(year, month - 1, day, hours || 9, minutes || 0, 0, 0);
    const endDateObj = new Date(startDateObj.getTime() + durationMinutes * 60 * 1000);

    const formatGCalDate = (d: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const min = pad(d.getMinutes());
      const ss = pad(d.getSeconds());
      return `${yyyy}${mm}${dd}T${hh}${min}${ss}`;
    };

    const datesParam = `${formatGCalDate(startDateObj)}/${formatGCalDate(endDateObj)}`;
    
    const label = lesson.name || (isCycle ? '6-week Private Lesson Package' : 'Private Ice Skating Lesson');
    // Display student name first, followed by lesson name on the event title
    const title = encodeURIComponent(`${studentName || 'Student'} - ${label}`);
    const details = encodeURIComponent(
      `Student: ${studentName || 'N/A'}\n` +
      `Coach: ${coachName || 'N/A'}\n` +
      `Duration: ${lesson.duration}\n` +
      (isCycle ? `6-Week Cycle Package starting on ${lesson.date}` : `Single lesson scheduled at ${lesson.time}`)
    );
    
    let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${datesParam}&details=${details}`;
    
    if (isCycle) {
      // Default set the repeat day for the event as weekly and 6 occurrences (RRULE:FREQ=WEEKLY;COUNT=6)
      url += `&recur=RRULE%3AFREQ%3DWEEKLY%3BCOUNT%3D6`;
    }
    
    return url;
  };

  const saveInvoiceToHistory = (invToSave: InvoiceData = invoice) => {
    setInvoiceHistory(prev => {
      const timestamp = new Date().toISOString();
      const prepared = {
        ...invToSave,
        savedAt: timestamp
      };
      
      const exists = prev.some(inv => inv.id === invToSave.id);
      let updated;
      if (exists) {
        updated = prev.map(inv => inv.id === invToSave.id ? prepared : inv);
      } else {
        updated = [prepared, ...prev];
      }
      
      localStorage.setItem('skating_invoice_history', JSON.stringify(updated));
      
      // Auto-trigger sync
      triggerAutoSyncIfLoggedIn();
      
      return updated;
    });
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  // Google Sync helpers
  const triggerAutoSyncIfLoggedIn = () => {
    // Completely disabled to give the user 100% manual control over all sync actions.
  };

  const getRedirectUri = () => {
    let origin = window.location.origin;
    if (!origin || origin === 'null' || origin.startsWith('file:')) {
      return 'https://localhost/';
    }
    return origin.endsWith('/') ? origin : `${origin}/`;
  };

  const startGoogleDeviceFlow = async () => {
    setIsSyncing(true);
    setSyncMessage('Starting device authentication...');
    try {
      const isNative = Capacitor.isNativePlatform();
      
      let data: any;
      if (isNative) {
        const response = await CapacitorHttp.post({
          url: 'https://oauth2.googleapis.com/device/code',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          data: {
            client_id: googleClientId.trim(),
            client_secret: googleClientSecret.trim(),
            scope: 'https://www.googleapis.com/auth/drive.file'
          }
        });
        if (response.status !== 200) {
          throw new Error(`Device code request failed (status ${response.status}): ${JSON.stringify(response.data)}`);
        }
        data = response.data;
      } else {
        const res = await fetch('https://oauth2.googleapis.com/device/code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `client_id=${encodeURIComponent(googleClientId.trim())}&client_secret=${encodeURIComponent(googleClientSecret.trim())}&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file')}`
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Device code request failed: ${errText}`);
        }
        data = await res.json();
      }
      
      setDeviceUserCode(data.user_code);
      setDeviceVerificationUri(data.verification_uri || 'https://google.com/device');
      setSyncMessage('Device code generated. Please authorize in your browser.');
      
      const deviceCode = data.device_code;
      const interval = (data.interval || 5) * 1000;
      const expiresAt = Date.now() + (data.expires_in || 1800) * 1000;
      
      const poll = async () => {
        if (Date.now() > expiresAt) {
          setDeviceUserCode('');
          setSyncMessage('Device authentication expired. Please try again.');
          setIsSyncing(false);
          return;
        }
        
        try {
          let pollData: any;
          let isOk = false;
          
          if (isNative) {
            const pollRes = await CapacitorHttp.post({
              url: 'https://oauth2.googleapis.com/token',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              data: {
                client_id: googleClientId.trim(),
                client_secret: googleClientSecret.trim(),
                device_code: deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
              }
            });
            pollData = pollRes.data;
            isOk = pollRes.status === 200;
          } else {
            const pollRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `client_id=${encodeURIComponent(googleClientId.trim())}&client_secret=${encodeURIComponent(googleClientSecret.trim())}&device_code=${encodeURIComponent(deviceCode)}&grant_type=urn:ietf:params:oauth:grant-type:device_code`
            });
            pollData = await pollRes.json();
            isOk = pollRes.ok;
          }
          
          if (isOk && pollData.access_token) {
            const token = pollData.access_token;
            const expiryTime = Date.now() + (pollData.expires_in || 3600) * 1000;
            
            setGoogleToken(token);
            setGoogleTokenExpiry(expiryTime);
            localStorage.setItem('skating_google_token', token);
            localStorage.setItem('skating_google_token_expiry', String(expiryTime));
            
            setDeviceUserCode('');
            setSyncMessage('Authorization successful! Cloud is online. You can now Sync Now or Force Overwrite.');
            setIsSyncing(false);
          } else {
            const error = pollData.error;
            if (error === 'authorization_pending') {
              setSyncMessage(`Waiting for authorization on Google... code: ${data.user_code}`);
              setTimeout(poll, interval);
            } else if (error === 'slow_down') {
              setSyncMessage('Google requested slow down. Waiting...');
              setTimeout(poll, interval + 5000);
            } else {
              throw new Error(pollData.error_description || error || 'Unknown poll error');
            }
          }
        } catch (pollErr: any) {
          console.error('Polling error (still waiting):', pollErr);
          setSyncMessage(`Waiting (network details: ${pollErr.message || 'Retrying connection...'})`);
          setTimeout(poll, interval);
        }
      };
      
      setTimeout(poll, interval);
      
    } catch (err: any) {
      console.error(err);
      setSyncMessage(`Device flow failed: ${err.message || 'Unknown error'}`);
      setIsSyncing(false);
      alert(`OAuth Device Flow Error: ${err.message || 'Unknown error'}\n\nNote: Please make sure your Client ID is created as a "TVs and Limited-Input Devices" type in your Google Cloud Console.`);
    }
  };

  const handleGoogleLogin = async () => {
    if (!googleClientId.trim()) {
      setShowGoogleConfig(true);
      alert('Please enter your Google OAuth Client ID first.');
      return;
    }

    const origin = window.location.origin;
    const isNative = origin === 'null' || origin.startsWith('file:') || (origin.includes('localhost') && !window.location.port);
    
    if (isNative) {
      await startGoogleDeviceFlow();
      return;
    }

    const scope = 'https://www.googleapis.com/auth/drive.file';
    const redirectUri = getRedirectUri();
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(googleClientId.trim())}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token&` +
      `scope=${encodeURIComponent(scope)}&` +
      `prompt=select_account`;
    window.location.href = authUrl;
  };

  const handleGoogleLogout = () => {
    setGoogleToken(null);
    setGoogleTokenExpiry(0);
    localStorage.removeItem('skating_google_token');
    localStorage.removeItem('skating_google_token_expiry');
    setSyncMessage('Google Account signed out.');
  };

  const triggerGoogleSync = async (currentToken: string | null = googleToken, expiry: number = googleTokenExpiry) => {
    if (!currentToken) {
      handleGoogleLogin();
      return;
    }
    if (Date.now() >= expiry && expiry > 0) {
      handleGoogleLogin();
      return;
    }
    setIsSyncing(true);
    setSyncMessage('Connecting to Google Drive...');
    try {
      setSyncMessage('Searching for backup file...');
      let fileId = await findSyncFile(currentToken);
      let remoteData: any = null;
      if (fileId) {
        setSyncMessage('Downloading remote data...');
        remoteData = await downloadSyncFile(fileId, currentToken);
      }
      
      const localInvs = JSON.parse(localStorage.getItem('skating_invoice_history') || '[]');
      const localExps = JSON.parse(localStorage.getItem('skating_tax_expenses') || '[]');
      const localImps = JSON.parse(localStorage.getItem('skating_csv_imports_history') || '[]');
      
      setSyncMessage('Merging data...');
      const mergedInvoices = mergeInvoices(localInvs, remoteData?.invoiceHistory || []);
      const mergedExpenses = mergeExpenses(localExps, remoteData?.taxExpenses || []);
      const mergedImports = mergeImports(localImps, remoteData?.csvImportsHistory || []);

      setInvoiceHistory(mergedInvoices);
      localStorage.setItem('skating_invoice_history', JSON.stringify(mergedInvoices));
      setTaxExpenses(mergedExpenses);
      localStorage.setItem('skating_tax_expenses', JSON.stringify(mergedExpenses));
      setCsvImportsHistory(mergedImports);
      localStorage.setItem('skating_csv_imports_history', JSON.stringify(mergedImports));

      const dataToUpload = {
        invoiceHistory: mergedInvoices,
        taxExpenses: mergedExpenses,
        csvImportsHistory: mergedImports,
        lastUpdated: new Date().toISOString()
      };

      setSyncMessage('Uploading merged data...');
      if (fileId) {
        await updateSyncFile(fileId, dataToUpload, currentToken);
      } else {
        await createSyncFile(dataToUpload, currentToken);
      }

      const syncTimeStr = new Date().toLocaleString();
      setLastSyncTime(syncTimeStr);
      localStorage.setItem('skating_last_sync_time', syncTimeStr);
      setSyncMessage('Sync complete! All devices are up-to-date.');
    } catch (err: any) {
      console.error(err);
      setSyncMessage(`Sync failed: ${err.message || 'Unknown error'}`);
      // Self-healing: if token is unauthorized or expired, sign out to allow a clean re-auth
      if (err.message?.includes('401') || err.message?.includes('Unauthorized')) {
        setTimeout(() => handleGoogleLogout(), 1500);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const forceUploadLocalToGoogle = async (currentToken: string | null = googleToken, expiry: number = googleTokenExpiry) => {
    if (!currentToken) {
      handleGoogleLogin();
      return;
    }
    if (Date.now() >= expiry && expiry > 0) {
      handleGoogleLogin();
      return;
    }
    
    if (!confirm('⚠️ WARNING: This will completely OVERWRITE your Google Drive backup with whatever is currently on this device. Remote data will be permanently lost.\n\nAre you sure you want to proceed?')) {
      return;
    }
    
    setIsSyncing(true);
    setSyncMessage('Forcing upload to Google Drive...');
    
    try {
      setSyncMessage('Searching for existing backup file...');
      let fileId = await findSyncFile(currentToken);
      
      const localInvs = JSON.parse(localStorage.getItem('skating_invoice_history') || '[]');
      const localExps = JSON.parse(localStorage.getItem('skating_tax_expenses') || '[]');
      const localImps = JSON.parse(localStorage.getItem('skating_csv_imports_history') || '[]');
      
      const dataToUpload = {
        invoiceHistory: localInvs,
        taxExpenses: localExps,
        csvImportsHistory: localImps,
        lastUpdated: new Date().toISOString()
      };
      
      setSyncMessage('Overwriting remote backup...');
      if (fileId) {
        await updateSyncFile(fileId, dataToUpload, currentToken);
      } else {
        await createSyncFile(dataToUpload, currentToken);
      }
      
      const syncTimeStr = new Date().toLocaleString();
      setLastSyncTime(syncTimeStr);
      localStorage.setItem('skating_last_sync_time', syncTimeStr);
      setSyncMessage('Google Drive backup overwritten successfully!');
      alert('Success! Your Google Drive backup file has been overwritten with your current local device data.');
    } catch (err: any) {
      console.error(err);
      setSyncMessage(`Force upload failed: ${err.message || 'Unknown error'}`);
      alert(`Error: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const deduplicateInvoicesAndExpenses = () => {
    if (!confirm('Deduplicate Tax Hub Data:\n\nThis will scan all invoices and expenses on your device, and automatically remove any identical duplicates. Your original records will be preserved.\n\nDo you want to run this cleanup now?')) {
      return;
    }
    
    let cleanedInvoicesCount = 0;
    let cleanedExpensesCount = 0;

    // 1. Deduplicate Invoices
    setInvoiceHistory(prev => {
      const seen = new Set<string>();
      const unique: InvoiceData[] = [];
      
      prev.forEach(inv => {
        const lessonsKey = inv.lessons.map(l => `${l.date}_${l.time}_${l.duration}_${l.customPrice || inv.rate}`).join('|');
        const fingerprint = `${inv.studentName}_${inv.amount}_${lessonsKey}`;
        
        if (!seen.has(fingerprint)) {
          seen.add(fingerprint);
          unique.push(inv);
        } else {
          cleanedInvoicesCount++;
        }
      });
      
      localStorage.setItem('skating_invoice_history', JSON.stringify(unique));
      return unique;
    });

    // 2. Deduplicate Expenses
    setTaxExpenses(prev => {
      const seen = new Set<string>();
      const unique: Expense[] = [];
      
      prev.forEach(exp => {
        const fingerprint = `${exp.date}_${exp.category}_${exp.amount}_${exp.description}`;
        if (!seen.has(fingerprint)) {
          seen.add(fingerprint);
          unique.push(exp);
        } else {
          cleanedExpensesCount++;
        }
      });
      
      localStorage.setItem('skating_tax_expenses', JSON.stringify(unique));
      return unique;
    });

    alert(`Cleanup complete!\n✓ Removed ${cleanedInvoicesCount} duplicate invoice(s)\n✓ Removed ${cleanedExpensesCount} duplicate expense(s)\n\nYour Tax Hub has been restored!`);
    
    triggerAutoSyncIfLoggedIn();
  };

  const handleResError = async (res: Response, prefix: string) => {
    let details = '';
    try {
      const errJson = await res.json();
      details = errJson.error?.message || JSON.stringify(errJson);
    } catch (e) {
      details = res.statusText || String(res.status);
    }
    throw new Error(`${prefix}: ${res.status} ${details}`);
  };

  const findSyncFile = async (token: string): Promise<string | null> => {
    const url = 'https://www.googleapis.com/drive/v3/files?' + 
      'q=' + encodeURIComponent("name = 'coach_ledger_sync.json' and trashed = false");
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) await handleResError(res, "Google API error");
    const data = await res.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
  };

  const downloadSyncFile = async (fileId: string, token: string) => {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) await handleResError(res, "Failed to download backup");
    return await res.json();
  };

  const createSyncFile = async (data: any, token: string) => {
    const metadata = {
      name: 'coach_ledger_sync.json'
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form
    });
    if (!res.ok) await handleResError(res, "Failed to create backup");
    return await res.json();
  };

  const updateSyncFile = async (fileId: string, data: any, token: string) => {
    const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) await handleResError(res, "Failed to upload backup");
    return await res.json();
  };

  const mergeInvoices = (local: InvoiceData[], remote: InvoiceData[]): InvoiceData[] => {
    const map = new Map<string, InvoiceData>();
    local.forEach(inv => map.set(inv.id, inv));
    remote.forEach(remoteInv => {
      const existing = map.get(remoteInv.id);
      if (!existing) {
        map.set(remoteInv.id, remoteInv);
      } else {
        const localTime = new Date(existing.savedAt || 0).getTime();
        const remoteTime = new Date(remoteInv.savedAt || 0).getTime();
        if (remoteTime > localTime) map.set(remoteInv.id, remoteInv);
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const aTime = new Date(a.savedAt || 0).getTime();
      const bTime = new Date(b.savedAt || 0).getTime();
      return bTime - aTime;
    });
  };

  const mergeExpenses = (local: Expense[], remote: Expense[]): Expense[] => {
    const map = new Map<string, Expense>();
    local.forEach(exp => map.set(exp.id, exp));
    remote.forEach(remoteExp => {
      if (!map.has(remoteExp.id)) map.set(remoteExp.id, remoteExp);
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  };

  const mergeImports = (local: CsvImportRecord[], remote: CsvImportRecord[]): CsvImportRecord[] => {
    const map = new Map<string, CsvImportRecord>();
    local.forEach(rec => map.set(rec.batchId, rec));
    remote.forEach(remoteRec => {
      if (!map.has(remoteRec.batchId)) map.set(remoteRec.batchId, remoteRec);
    });
    return Array.from(map.values()).sort((a, b) => b.importDate.localeCompare(a.importDate));
  };

    const handleTaxCsvImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate extension client-side (accept="*/*" is needed for Android to show all files)
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.tsv') && !fileName.endsWith('.txt')) {
      alert('Please select a CSV file (.csv or .txt).');
      return;
    }

    // DOM clone trick: replace the input node entirely so Android WebView always fires onChange
    // Setting .value='' alone is unreliable on Android WebView
    if (taxCsvFileInputRef.current) {
      const oldInput = taxCsvFileInputRef.current;
      const newInput = oldInput.cloneNode(true) as HTMLInputElement;
      newInput.addEventListener('change', (ev) => handleTaxCsvImport(ev as unknown as ChangeEvent<HTMLInputElement>));
      oldInput.parentNode?.replaceChild(newInput, oldInput);
      taxCsvFileInputRef.current = newInput;
    }

    // Helper to parse dates in various standard or textual formats
    const parseCsvDate = (rawDate: string): string => {
      if (!rawDate) return getLocalDateString();
      
      const cleanStr = rawDate.trim().replace(/["']/g, '');
      if (!cleanStr) return getLocalDateString();

      // 1. Try native Date parsing for ISO dates or clear text months (safe for standard JS parsing)
      const nativeParsed = new Date(cleanStr);
      if (!isNaN(nativeParsed.getTime())) {
        const hasTextMonth = /[a-zA-Z]/.test(cleanStr);
        const isIso = /^\d{4}-\d{2}-\d{2}/.test(cleanStr);
        if (hasTextMonth || isIso) {
          const year = nativeParsed.getFullYear();
          const month = String(nativeParsed.getMonth() + 1).padStart(2, '0');
          const day = String(nativeParsed.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      }

      // 2. Normalize and check textual months manually (e.g. "26 May 2026", "May 26, 2026")
      const monthsMap: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
        january: '01', february: '02', march: '03', april: '04', june: '06',
        july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
      };

      const processedStr = cleanStr.toLowerCase();
      let foundMonthNum = '';
      let foundMonthText = '';
      for (const [mName, mNum] of Object.entries(monthsMap)) {
        if (processedStr.includes(mName)) {
          foundMonthNum = mNum;
          foundMonthText = mName;
          break;
        }
      }

      if (foundMonthNum && foundMonthText) {
        const digits = processedStr.replace(new RegExp(foundMonthText, 'g'), ' ')
                                   .replace(/[^0-9]/g, ' ')
                                   .trim()
                                   .split(/\s+/)
                                   .filter(Boolean);
        if (digits.length >= 2) {
          let day = '';
          let year = '';
          if (digits[0].length === 4) {
            year = digits[0];
            day = digits[1];
          } else {
            day = digits[0];
            let yr = digits[1];
            if (yr.length === 2) {
              yr = '20' + yr;
            }
            year = yr;
          }
          return `${year}-${foundMonthNum.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }

      // 3. Handle numeric formats with or without time (e.g. "26/05/2026 14:30" or "2026-05-26")
      let datePartOnly = cleanStr;
      if (cleanStr.includes(' ')) {
        const parts = cleanStr.split(/\s+/);
        if (parts[0].includes('/') || parts[0].includes('-') || parts[0].includes('.')) {
          datePartOnly = parts[0];
        } else if (parts[parts.length - 1].includes('/') || parts[parts.length - 1].includes('-') || parts[parts.length - 1].includes('.')) {
          datePartOnly = parts[parts.length - 1];
        } else {
          datePartOnly = parts[0];
        }
      }

      const normalizedDelim = datePartOnly.replace(/[\/.]/g, '-');
      const dateParts = normalizedDelim.split('-');

      if (dateParts.length === 3) {
        let year = '';
        let month = '';
        let day = '';

        if (dateParts[0].length === 4) {
          year = dateParts[0];
          month = dateParts[1];
          day = dateParts[2];
        } else {
          const part0 = parseInt(dateParts[0]);
          const part1 = parseInt(dateParts[1]);
          const part2Raw = dateParts[2];
          let part2 = parseInt(part2Raw);
          
          if (part2Raw.length === 2) {
            part2 = 2000 + part2;
          }
          year = String(part2);

          if (part0 > 12) {
            day = String(part0);
            month = String(part1);
          } else if (part1 > 12) {
            day = String(part1);
            month = String(part0);
          } else {
            day = String(part0);
            month = String(part1);
          }
        }

        if (year && month && day) {
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }

      return getLocalDateString();
    };

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
          alert("CSV file seems to be empty or has no header.");
          return;
        }

        // Detect Delimiter Dynamically
        const firstLine = lines[0];
        const commaCount = (firstLine.match(/,/g) || []).length;
        const semicolonCount = (firstLine.match(/;/g) || []).length;
        const tabCount = (firstLine.match(/\t/g) || []).length;
        
        let delimiter = ',';
        if (semicolonCount > commaCount && semicolonCount > tabCount) {
          delimiter = ';';
        } else if (tabCount > commaCount && tabCount > semicolonCount) {
          delimiter = '\t';
        }

        // Split headers using dynamic delimiter
        const headers = firstLine.split(delimiter).map(s => s.trim().toLowerCase().replace(/["']/g, ''));
        
        const dateIdx = headers.findIndex(h => h.includes('date'));
        const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('kind') || h.includes('trans'));
        const amountIdx = headers.findIndex(h => h.includes('amount') || h.includes('value') || h.includes('price') || h.includes('total'));
        const categoryIdx = headers.findIndex(h => h.includes('category') || h.includes('tag') || h.includes('class'));
        const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('note') || h.includes('memo') || h.includes('details'));
        const paymentIdx = headers.findIndex(h => h.includes('payment') || h.includes('method') || h.includes('pay'));

        // Dual-column amount headers
        const incomeColIdx = headers.findIndex(h => 
          h === 'income' || h === 'earnings' || h === 'revenue' || h === 'received' || h === 'deposit' || h === 'sales' || h === 'credit' ||
          h.includes('income') || h.includes('earning') || h.includes('received') || h.includes('deposit') || h.includes('credit')
        );
        
        const expenseColIdx = headers.findIndex(h => 
          h === 'expense' || h === 'expenses' || h === 'spent' || h === 'paid' || h === 'withdrawal' || h === 'debit' || h === 'deduction' ||
          h.includes('expense') || h.includes('spent') || h.includes('paid') || h.includes('debit') || h.includes('deduction')
        );

        if (dateIdx === -1 || (amountIdx === -1 && incomeColIdx === -1 && expenseColIdx === -1)) {
          alert("CSV must contain at least 'Date' and 'Amount' (or 'Income' / 'Expense') columns.");
          return;
        }

        const newInvoices: InvoiceData[] = [];
        const newExpenses: Expense[] = [];
        const batchId = `IMPORT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        // Escape delimiter for regex
        const escapedDelimiter = delimiter.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const rowRegex = new RegExp(`${escapedDelimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`);

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const row = line.split(rowRegex).map(s => s.trim().replace(/^["']|["']$/g, ''));
          if (row.length <= dateIdx) continue;
          
          const rawDate = row[dateIdx];
          if (!rawDate) continue;

          // Parse amount using single-column or dual-column layout
          let rawAmount = 0;
          let isIncome = false;
          let isExpense = false;
          let hasAmount = false;

          // 1. Try single Amount column first
          if (amountIdx !== -1 && amountIdx < row.length && row[amountIdx]) {
            const rawAmountStr = row[amountIdx];
            const hasParentheses = rawAmountStr.includes('(') && rawAmountStr.includes(')');
            const cleanAmountStr = rawAmountStr.replace(/[^\d.-]/g, '');
            let parsedVal = parseFloat(cleanAmountStr);
            if (!isNaN(parsedVal)) {
              rawAmount = parsedVal;
              hasAmount = true;
              if (hasParentheses && rawAmount > 0) {
                rawAmount = -rawAmount;
              }
            }
          }

          // 2. Fallback to separate Income / Expense columns if single Amount didn't yield a valid number
          if (!hasAmount) {
            let incomeVal = NaN;
            let expenseVal = NaN;

            if (incomeColIdx !== -1 && incomeColIdx < row.length && row[incomeColIdx]) {
              incomeVal = parseFloat(row[incomeColIdx].replace(/[^\d.-]/g, ''));
            }
            if (expenseColIdx !== -1 && expenseColIdx < row.length && row[expenseColIdx]) {
              expenseVal = parseFloat(row[expenseColIdx].replace(/[^\d.-]/g, ''));
            }

            if (!isNaN(incomeVal) && incomeVal !== 0) {
              rawAmount = Math.abs(incomeVal);
              isIncome = true;
              hasAmount = true;
            } else if (!isNaN(expenseVal) && expenseVal !== 0) {
              rawAmount = Math.abs(expenseVal);
              isExpense = true;
              hasAmount = true;
            }
          }

          if (!hasAmount || isNaN(rawAmount) || rawAmount === 0) continue;

          const rawType = typeIdx !== -1 && typeIdx < row.length && row[typeIdx] ? row[typeIdx].trim() : '';
          const rawCategory = categoryIdx !== -1 && categoryIdx < row.length && row[categoryIdx] ? row[categoryIdx].trim() : 'Other';
          const rawDesc = descIdx !== -1 && descIdx < row.length && row[descIdx] ? row[descIdx].trim() : '';
          const rawPayment = paymentIdx !== -1 && paymentIdx < row.length && row[paymentIdx] ? row[paymentIdx].trim() : 'Cash';

          // Standardize date to YYYY-MM-DD using helper
          const formattedDate = parseCsvDate(rawDate);

          // Determine type (if not already explicitly set by dual columns)
          if (!isIncome && !isExpense) {
            if (rawAmount < 0) {
              isExpense = true;
              rawAmount = Math.abs(rawAmount);
            } else {
              if (rawType) {
                const typeLower = rawType.toLowerCase();
                const hasExpenseKeyword = 
                  typeLower.includes('expense') || 
                  typeLower.includes('cost') || 
                  typeLower.includes('debit') || 
                  typeLower.includes('spend') || 
                  typeLower.includes('purchase') || 
                  typeLower.includes('outflow') || 
                  typeLower.includes('outgoings') || 
                  typeLower.includes('deduct') || 
                  typeLower.includes('pay') || 
                  typeLower.includes('fee') || 
                  typeLower.includes('hire') || 
                  typeLower.includes('bill') || 
                  typeLower === 'exp' || 
                  typeLower.startsWith('exp ') || 
                  typeLower.endsWith(' exp') || 
                  typeLower === '-' || 
                  typeLower === 'n';

                const hasIncomeKeyword = 
                  typeLower.includes('income') || 
                  typeLower.includes('incoming') || 
                  typeLower.includes('revenue') || 
                  typeLower.includes('earning') || 
                  typeLower.includes('deposit') || 
                  typeLower.includes('credit') || 
                  typeLower.includes('receive') || 
                  typeLower.includes('sales') || 
                  typeLower.includes('inflow') || 
                  typeLower.includes('inc') || 
                  typeLower.includes('rev') || 
                  typeLower.includes('earn') || 
                  typeLower === 'in' || 
                  typeLower.startsWith('in ') || 
                  typeLower === '+' || 
                  typeLower === 'y';

                if (hasExpenseKeyword) {
                  isExpense = true;
                } else if (hasIncomeKeyword) {
                  isIncome = true;
                }
              }

              if (!isIncome && !isExpense && amountIdx !== -1) {
                const amountHeader = headers[amountIdx];
                const headerLower = amountHeader.toLowerCase();
                if (
                  headerLower.includes('expense') || 
                  headerLower.includes('spend') || 
                  headerLower.includes('cost') || 
                  headerLower.includes('debit') || 
                  headerLower.includes('deduction') || 
                  headerLower.includes('pay') || 
                  headerLower.includes('bill')
                ) {
                  isExpense = true;
                } else if (
                  headerLower.includes('income') || 
                  headerLower.includes('revenue') || 
                  headerLower.includes('earn') || 
                  headerLower.includes('credit') || 
                  headerLower.includes('deposit') || 
                  headerLower.includes('sales')
                ) {
                  isIncome = true;
                }
              }

              if (!isIncome && !isExpense) {
                const catLower = rawCategory.toLowerCase();
                const descLower = rawDesc.toLowerCase();
                
                const expenseKeywords = [
                  'ice hire', 'equipment', 'travel', 'insurance', 'gear', 'rink', 
                  'petrol', 'gas', 'flights', 'hotel', 'fee', 'fees', 'music', 
                  'choreography', 'association', 'registration', 'cost', 'spend', 
                  'expense', 'bill', 'purchase', 'rent', 'tax', 'phone', 'internet',
                  'stationery', 'postage', 'software', 'subscription', 'advertising'
                ];

                const incomeKeywords = [
                  'lesson', 'lessons', 'coaching', 'student', 'students', 'income', 
                  'revenue', 'earn', 'earning', 'earnings', 'invoice', 'credit', 
                  'sales', 'deposit', 'bonus', 'interest'
                ];

                const hasExpenseCat = expenseKeywords.some(kw => catLower.includes(kw) || descLower.includes(kw));
                const hasIncomeCat = incomeKeywords.some(kw => catLower.includes(kw) || descLower.includes(kw));

                if (hasExpenseCat && !hasIncomeCat) {
                  isExpense = true;
                } else if (hasIncomeCat && !hasExpenseCat) {
                  isIncome = true;
                }
              }

              if (!isIncome && !isExpense && file.name) {
                const fileNameLower = file.name.toLowerCase();
                if (
                  fileNameLower.includes('expense') || 
                  fileNameLower.includes('deduction') || 
                  fileNameLower.includes('spend') || 
                  fileNameLower.includes('outflow')
                ) {
                  isExpense = true;
                } else if (
                  fileNameLower.includes('income') || 
                  fileNameLower.includes('revenue') || 
                  fileNameLower.includes('earn') || 
                  fileNameLower.includes('inflow')
                ) {
                  isIncome = true;
                }
              }

              if (!isIncome && !isExpense) {
                isIncome = true;
              }
            }
          }

          if (isIncome) {
            const invId = `EX-INC-${Date.now()}-${i}`;
            const invEntry: InvoiceData = {
              id: invId,
              studentId: 'external',
              studentName: rawCategory || 'External Income',
              parentName: '',
              email: '',
              lessons: [{
                id: `EX-LES-${Date.now()}-${i}`,
                date: formattedDate,
                time: '12:00',
                duration: '60 min',
                type: 'Single',
                name: rawDesc || 'Imported Income Record',
                customPrice: rawAmount
              }],
              dueDate: formattedDate,
              billingCycle: 'Single',
              notes: rawDesc || 'Imported Income Record',
              paymentMethod: rawPayment,
              amount: rawAmount,
              coachName: invoice.coachName || DEFAULT_COACH_NAME,
              coachEmail: invoice.coachEmail || DEFAULT_COACH_EMAIL,
              coachAbn: invoice.coachAbn || DEFAULT_COACH_ABN,
              term: 'Historical',
              rate: rawAmount,
              savedAt: new Date(formattedDate + 'T12:00:00').toISOString(),
              importBatchId: batchId
            };
            newInvoices.push(invEntry);
          } else if (isExpense) {
            const expEntry: Expense = {
              id: `EX-EXP-${Date.now()}-${i}`,
              date: formattedDate,
              category: rawCategory,
              amount: rawAmount,
              description: rawDesc || 'Imported Expense Record',
              paymentMethod: rawPayment,
              importBatchId: batchId
            };
            newExpenses.push(expEntry);
          }
        }

        if (newInvoices.length > 0) {
          setInvoiceHistory(prev => {
            const updated = [...newInvoices, ...prev];
            localStorage.setItem('skating_invoice_history', JSON.stringify(updated));
            return updated;
          });
        }

        if (newExpenses.length > 0) {
          setTaxExpenses(prev => {
            const updated = [...newExpenses, ...prev];
            localStorage.setItem('skating_tax_expenses', JSON.stringify(updated));
            return updated;
          });
        }

        if (newInvoices.length > 0 || newExpenses.length > 0) {
          const importRecord: CsvImportRecord = {
            batchId,
            fileName: file.name,
            importDate: new Date().toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            invoicesCount: newInvoices.length,
            expensesCount: newExpenses.length
          };
          setCsvImportsHistory(prev => [importRecord, ...prev]);
        }
        
        triggerAutoSyncIfLoggedIn();

        alert(`Successfully imported financial records:\n✓ ${newInvoices.length} Invoiced Income records\n✓ ${newExpenses.length} Business Expense records`);
      } catch (err) {
        alert("Failed to parse CSV file. Please check column format.");
      }
    };
    reader.readAsText(file);
  };

  const rollbackCsvImport = (batchId: string) => {
    const record = csvImportsHistory.find(r => r.batchId === batchId);
    if (!record) return;

    if (!confirm(`Are you sure you want to rollback this CSV import?\n\nFile: ${record.fileName}\nImported: ${record.importDate}\n\nThis will permanently delete:\n- ${record.invoicesCount} Invoiced Income records\n- ${record.expensesCount} Business Expense records\n\nThis action cannot be undone.`)) {
      return;
    }

    setInvoiceHistory(prev => {
      const updated = prev.filter(inv => inv.importBatchId !== batchId);
      localStorage.setItem('skating_invoice_history', JSON.stringify(updated));
      return updated;
    });

    setTaxExpenses(prev => {
      const updated = prev.filter(exp => exp.importBatchId !== batchId);
      localStorage.setItem('skating_tax_expenses', JSON.stringify(updated));
      return updated;
    });

    setCsvImportsHistory(prev => {
      const updated = prev.filter(r => r.batchId !== batchId);
      localStorage.setItem('skating_csv_imports_history', JSON.stringify(updated));
      return updated;
    });

    alert(`Rollback successful! Removed associated financial records.`);
    triggerAutoSyncIfLoggedIn();
  };

  // Tax and Expense Tracker Handlers
  const addExpense = () => {
    const parsedAmount = parseFloat(newExpense.amount as any);
    if (isNaN(parsedAmount) || parsedAmount === 0 || !newExpense.description?.trim()) {
      alert("Please enter a valid non-zero amount and description.");
      return;
    }
    
    const expense: Expense = {
      id: `EXP-${Date.now()}`,
      date: newExpense.date || getLocalDateString(),
      category: newExpense.category || 'Other',
      amount: parsedAmount,
      description: newExpense.description.trim(),
      paymentMethod: newExpense.paymentMethod || 'Cash'
    };
    
    setTaxExpenses([...taxExpenses, expense]);
    setNewExpense({
      date: getLocalDateString(),
      category: 'Ice Hire',
      amount: '',
      description: '',
      paymentMethod: 'Cash'
    });
    triggerAutoSyncIfLoggedIn();
  };

  const removeExpense = (id: string) => {
    setTaxExpenses(taxExpenses.filter(e => e.id !== id));
    triggerAutoSyncIfLoggedIn();
  };

  const getTaxPeriodRange = (yearStr: string, type: 'FY' | 'CY') => {
    if (!yearStr) {
      const currentYear = new Date().getFullYear();
      return type === 'FY' 
        ? { start: new Date(`${currentYear - 1}-07-01T00:00:00`), end: new Date(`${currentYear}-06-30T23:59:59`) }
        : { start: new Date(`${currentYear}-01-01T00:00:00`), end: new Date(`${currentYear}-12-31T23:59:59`) };
    }
    
    if (type === 'FY') {
      const [startYear] = yearStr.split('-');
      const start = new Date(`${startYear}-07-01T00:00:00`);
      const end = new Date(`${parseInt(startYear) + 1}-06-30T23:59:59`);
      return { start, end };
    } else {
      const start = new Date(`${yearStr}-01-01T00:00:00`);
      const end = new Date(`${yearStr}-12-31T23:59:59`);
      return { start, end };
    }
  };

  const getTaxYearOptions = (type: 'FY' | 'CY') => {
    const years = new Set<number>();
    years.add(new Date().getFullYear());
    
    invoiceHistory.forEach(inv => {
      if (inv.savedAt) {
        years.add(new Date(inv.savedAt).getFullYear());
      }
    });
    
    taxExpenses.forEach(exp => {
      years.add(new Date(exp.date).getFullYear());
    });
    
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    
    if (type === 'FY') {
      return sortedYears.flatMap(y => [`${y - 1}-${y}`, `${y}-${y + 1}`]).filter((val, idx, self) => self.indexOf(val) === idx);
    } else {
      return sortedYears.map(String);
    }
  };

  const getMonthlyBreakdown = () => {
    const monthsData: { name: string; income: number; expenses: number; key: string }[] = [];
    const isFY = taxPeriodType === 'FY';
    
    let startMonth = 6; // July
    let startYear = new Date().getFullYear();
    const activeYearStr = selectedTaxYear || (new Date().getMonth() >= 6 ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`);
    
    if (isFY) {
      startYear = parseInt(activeYearStr.split('-')[0]) || new Date().getFullYear();
    } else {
      startYear = parseInt(activeYearStr) || new Date().getFullYear();
      startMonth = 0; // January
    }
    
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    
    for (let i = 0; i < 12; i++) {
      const m = (startMonth + i) % 12;
      const y = startYear + Math.floor((startMonth + i) / 12);
      const name = `${monthNames[m]} ${String(y).substring(2)}`;
      
      const mIncome = invoiceHistory.reduce((sum, inv) => {
        const invDate = inv.savedAt ? new Date(inv.savedAt) : new Date();
        if (invDate.getMonth() === m && invDate.getFullYear() === y) {
          return sum + Number(inv.amount || 0);
        }
        return sum;
      }, 0);
      
      const mExpenses = taxExpenses.reduce((sum, exp) => {
        const expDate = new Date(exp.date + 'T12:00:00');
        if (expDate.getMonth() === m && expDate.getFullYear() === y) {
          return sum + Number(exp.amount || 0);
        }
        return sum;
      }, 0);
      
      monthsData.push({
        name,
        income: mIncome,
        expenses: mExpenses,
        key: `${y}-${m}`
      });
    }
    
    return monthsData;
  };

  const getCategoryBreakdown = () => {
    const categories: Record<string, number> = {};
    
    const activeYearStr = selectedTaxYear || (new Date().getMonth() >= 6 ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`);
    const activeRange = getTaxPeriodRange(activeYearStr, taxPeriodType);
    
    const periodExpenses = taxExpenses.filter(exp => {
      const expDate = new Date(exp.date + 'T12:00:00');
      return expDate >= activeRange.start && expDate <= activeRange.end;
    });

    periodExpenses.forEach(exp => {
      const cat = exp.category || 'Other';
      if (!categories[cat]) {
        categories[cat] = 0;
      }
      categories[cat] += Number(exp.amount || 0);
    });
    
    return categories;
  };

  const getDailyInvoicedData = () => {
    const dailyMap: Record<string, { date: string; amount: number; count: number; invoices: InvoiceData[] }> = {};
    const activeYearStr = selectedTaxYear || (new Date().getMonth() >= 6 ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`);
    const activeRange = getTaxPeriodRange(activeYearStr, taxPeriodType);

    const periodInvoices = invoiceHistory.filter(inv => {
      const invDate = inv.savedAt ? new Date(inv.savedAt) : new Date();
      return invDate >= activeRange.start && invDate <= activeRange.end;
    });

    periodInvoices.forEach(inv => {
      const dayStr = inv.savedAt 
        ? getLocalDateString(new Date(inv.savedAt))
        : getLocalDateString();
        
      if (!dailyMap[dayStr]) {
        dailyMap[dayStr] = {
          date: dayStr,
          amount: 0,
          count: 0,
          invoices: []
        };
      }
      
      dailyMap[dayStr].amount += Number(inv.amount || 0);
      dailyMap[dayStr].count += 1;
      dailyMap[dayStr].invoices.push(inv);
    });
    
    return Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));
  };

  const downloadTaxPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const primaryColor = [37, 99, 235]; 
    const textColor = [30, 41, 59]; 
    const lightGray = [248, 250, 252]; 
    const borderGray = [226, 232, 240]; 
    
    const activeYearStr = selectedTaxYear || (new Date().getMonth() >= 6 ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`);
    const activeRange = getTaxPeriodRange(activeYearStr, taxPeriodType);

    const periodInvoices = invoiceHistory.filter(inv => {
      const invDate = inv.savedAt ? new Date(inv.savedAt) : new Date();
      return invDate >= activeRange.start && invDate <= activeRange.end;
    });

    const periodExpenses = taxExpenses.filter(exp => {
      const expDate = new Date(exp.date + 'T12:00:00');
      return expDate >= activeRange.start && expDate <= activeRange.end;
    });

    const grossRevenue = periodInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
    const totalGST = grossRevenue / 11;
    const totalExpensesAmount = periodExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
    const netTaxableIncome = Math.max(0, grossRevenue - totalExpensesAmount - totalGST);

    // Personal income tax calculations (Stage 3)
    let estIncomeTax = 0;
    if (netTaxableIncome <= 18200) {
      estIncomeTax = 0;
    } else if (netTaxableIncome <= 45000) {
      estIncomeTax = (netTaxableIncome - 18200) * 0.16;
    } else if (netTaxableIncome <= 135000) {
      estIncomeTax = 4288 + (netTaxableIncome - 45000) * 0.30;
    } else if (netTaxableIncome <= 190000) {
      estIncomeTax = 31288 + (netTaxableIncome - 135000) * 0.37;
    } else {
      estIncomeTax = 51638 + (netTaxableIncome - 190000) * 0.45;
    }

    const medicareLevy = netTaxableIncome * 0.02;
    const totalTaxDeduction = estIncomeTax + medicareLevy;
    const effectiveTaxRate = netTaxableIncome > 0 ? (totalTaxDeduction / netTaxableIncome) * 100 : 0;
    const netProfitAfterTax = Math.max(0, netTaxableIncome - totalTaxDeduction);
    const takeHomePercentage = netTaxableIncome > 0 ? (netProfitAfterTax / netTaxableIncome) * 100 : 100;

    // Title & Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("TAX SUMMARY REPORT", 14, 20);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139); 
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);
    
    // Coach Info
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.text(invoice.coachName || "Skating Coach", 14, 35);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Email: ${invoice.coachEmail || 'N/A'}`, 14, 40);
    doc.text(`ABN: ${invoice.coachAbn || 'N/A'}`, 14, 44);
    
    // Tax Period
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("REPORTING PERIOD", 120, 35);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const periodLabel = taxPeriodType === 'FY' ? `Financial Year July ${activeYearStr.split('-')[0]} - June ${activeYearStr.split('-')[1]}` : `Calendar Year ${activeYearStr}`;
    doc.text(periodLabel, 120, 40);
    doc.text(`Active Period: ${activeRange.start.toLocaleDateString()} - ${activeRange.end.toLocaleDateString()}`, 120, 44);
    
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.setLineWidth(0.5);
    doc.line(14, 50, 196, 50);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("FINANCIAL HEALTH SUMMARY", 14, 58);
    
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(14, 62, 182, 58, 3, 3, "F");
    
    doc.setFontSize(10);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFont("helvetica", "normal");
    
    doc.text("Gross Invoiced Earnings:", 20, 70);
    doc.text("GST Liabilities Collected (10%):", 20, 76);
    doc.text("Total Tax-Deductible Expenses:", 20, 82);
    doc.setFont("helvetica", "bold");
    doc.text("Estimated Net Taxable Income:", 20, 89);
    doc.setFont("helvetica", "normal");
    doc.text("Est. Personal Income Tax (Stage 3):", 20, 95);
    doc.text("Medicare Levy (2.0%):", 20, 101);
    doc.setFont("helvetica", "bold");
    doc.text("Estimated Net Profit After Tax:", 20, 108);
    
    doc.setFont("helvetica", "bold");
    doc.text(`$${grossRevenue.toFixed(2)}`, 140, 70);
    doc.text(`$${totalGST.toFixed(2)}`, 140, 76);
    doc.text(`$${totalExpensesAmount.toFixed(2)}`, 140, 82);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`$${netTaxableIncome.toFixed(2)}`, 140, 89);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.text(`$${estIncomeTax.toFixed(2)}`, 140, 95);
    doc.text(`$${medicareLevy.toFixed(2)}`, 140, 101);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129); // emerald green
    doc.text(`$${netProfitAfterTax.toFixed(2)} (${takeHomePercentage.toFixed(1)}% kept)`, 140, 108);
    
    let currentY = 132;
    doc.setFontSize(12);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.text("DAILY EARNINGS REPORT", 14, currentY);
    currentY += 6;
    
    doc.setFillColor(241, 245, 249);
    doc.rect(14, currentY, 182, 7, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text("DATE", 18, currentY + 5);
    doc.text("INVOICES COUNT", 80, currentY + 5);
    doc.text("DAILY TOTAL EARNINGS", 140, currentY + 5);
    
    currentY += 7;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    
    const dailyData = getDailyInvoicedData();
    if (dailyData.length === 0) {
      doc.text("No invoicing data found for this period.", 18, currentY + 6);
      currentY += 10;
    } else {
      dailyData.forEach((day, idx) => {
        if (currentY > 270) {
          doc.addPage();
          currentY = 20;
          doc.setFillColor(241, 245, 249);
          doc.rect(14, currentY, 182, 7, "F");
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(71, 85, 105);
          doc.text("DATE", 18, currentY + 5);
          doc.text("INVOICES COUNT", 80, currentY + 5);
          doc.text("DAILY TOTAL EARNINGS", 140, currentY + 5);
          currentY += 7;
          doc.setFont("helvetica", "normal");
          doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        }
        
        if (idx % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(14, currentY, 182, 6, "F");
        }
        
        const dateObj = new Date(day.date + 'T12:00:00');
        const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        
        doc.setFontSize(8);
        doc.text(formattedDate, 18, currentY + 4);
        doc.text(`${day.count} invoice(s)`, 80, currentY + 4);
        doc.setFont("helvetica", "bold");
        doc.text(`$${day.amount.toFixed(2)}`, 140, currentY + 4);
        doc.setFont("helvetica", "normal");
        
        currentY += 6;
      });
    }
    
    currentY += 10;
    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.text("ITEMIZED DEDUCTIBLE EXPENSES", 14, currentY);
    currentY += 6;
    
    doc.setFillColor(241, 245, 249);
    doc.rect(14, currentY, 182, 7, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text("DATE", 18, currentY + 5);
    doc.text("CATEGORY", 45, currentY + 5);
    doc.text("METHOD", 80, currentY + 5);
    doc.text("DESCRIPTION", 110, currentY + 5);
    doc.text("AMOUNT", 165, currentY + 5);
    
    currentY += 7;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    
    if (periodExpenses.length === 0) {
      doc.text("No deductible expenses logged for this period.", 18, currentY + 6);
      currentY += 10;
    } else {
      periodExpenses.forEach((exp, idx) => {
        if (currentY > 270) {
          doc.addPage();
          currentY = 20;
          doc.setFillColor(241, 245, 249);
          doc.rect(14, currentY, 182, 7, "F");
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(71, 85, 105);
          doc.text("DATE", 18, currentY + 5);
          doc.text("CATEGORY", 45, currentY + 5);
          doc.text("METHOD", 80, currentY + 5);
          doc.text("DESCRIPTION", 110, currentY + 5);
          doc.text("AMOUNT", 165, currentY + 5);
          currentY += 7;
          doc.setFont("helvetica", "normal");
          doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        }
        
        if (idx % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(14, currentY, 182, 6, "F");
        }
        
        const dateObj = new Date(exp.date + 'T12:00:00');
        const formattedDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        
        doc.setFontSize(8);
        doc.text(formattedDate, 18, currentY + 4);
        doc.text(exp.category, 45, currentY + 4);
        doc.text(exp.paymentMethod || 'Cash', 80, currentY + 4);
        
        let desc = exp.description || 'N/A';
        if (desc.length > 30) desc = desc.substring(0, 27) + '...';
        doc.text(desc, 110, currentY + 4);
        
        doc.setFont("helvetica", "bold");
        doc.text(`$${exp.amount.toFixed(2)}`, 165, currentY + 4);
        doc.setFont("helvetica", "normal");
        
        currentY += 6;
      });
    }
    
    const sanitizedPeriod = activeYearStr.replace(/\s+/g, '_');
    doc.save(`Tax_Summary_Report_${sanitizedPeriod}.pdf`);
  };

  const downloadTaxCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    const activeYearStr = selectedTaxYear || (new Date().getMonth() >= 6 ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`);
    const activeRange = getTaxPeriodRange(activeYearStr, taxPeriodType);

    const periodInvoices = invoiceHistory.filter(inv => {
      const invDate = inv.savedAt ? new Date(inv.savedAt) : new Date();
      return invDate >= activeRange.start && invDate <= activeRange.end;
    });

    const periodExpenses = taxExpenses.filter(exp => {
      const expDate = new Date(exp.date + 'T12:00:00');
      return expDate >= activeRange.start && expDate <= activeRange.end;
    });

    const grossRevenue = periodInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
    const totalGST = grossRevenue / 11;
    const totalExpensesAmount = periodExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
    const netTaxableIncome = Math.max(0, grossRevenue - totalExpensesAmount - totalGST);

    // Personal income tax calculations (Stage 3)
    let estIncomeTax = 0;
    if (netTaxableIncome <= 18200) {
      estIncomeTax = 0;
    } else if (netTaxableIncome <= 45000) {
      estIncomeTax = (netTaxableIncome - 18200) * 0.16;
    } else if (netTaxableIncome <= 135000) {
      estIncomeTax = 4288 + (netTaxableIncome - 45000) * 0.30;
    } else if (netTaxableIncome <= 190000) {
      estIncomeTax = 31288 + (netTaxableIncome - 135000) * 0.37;
    } else {
      estIncomeTax = 51638 + (netTaxableIncome - 190000) * 0.45;
    }

    const medicareLevy = netTaxableIncome * 0.02;
    const totalTaxDeduction = estIncomeTax + medicareLevy;
    const effectiveTaxRate = netTaxableIncome > 0 ? (totalTaxDeduction / netTaxableIncome) * 100 : 0;
    const netProfitAfterTax = Math.max(0, netTaxableIncome - totalTaxDeduction);

    csvContent += `CoachLedger Tax Summary Report\n`;
    csvContent += `Coach Name,${invoice.coachName || 'Skating Coach'}\n`;
    csvContent += `ABN,${invoice.coachAbn || 'N/A'}\n`;
    csvContent += `Reporting Period,${taxPeriodType === 'FY' ? 'Financial Year' : 'Calendar Year'} ${activeYearStr}\n`;
    csvContent += `Generated Date,${new Date().toLocaleDateString()}\n\n`;
    
    csvContent += `FINANCIAL SUMMARY\n`;
    csvContent += `Gross Earnings Invoiced,$${grossRevenue.toFixed(2)}\n`;
    csvContent += `GST Collected,$${totalGST.toFixed(2)}\n`;
    csvContent += `Business Expenses Deducted,$${totalExpensesAmount.toFixed(2)}\n`;
    csvContent += `Estimated Net Taxable Income,$${netTaxableIncome.toFixed(2)}\n`;
    csvContent += `Estimated Personal Income Tax (Stage 3),$${estIncomeTax.toFixed(2)}\n`;
    csvContent += `Medicare Levy (2.0%),$${medicareLevy.toFixed(2)}\n`;
    csvContent += `Total Estimated Tax Liability,$${totalTaxDeduction.toFixed(2)}\n`;
    csvContent += `Effective Tax Rate,${effectiveTaxRate.toFixed(1)}%\n`;
    csvContent += `Estimated Net Profit After Tax,$${netProfitAfterTax.toFixed(2)}\n\n`;
    
    csvContent += `INCOME BREAKDOWN (DAILY TOTALS)\n`;
    csvContent += `Date,Invoice Count,Total Invoiced\n`;
    const dailyData = getDailyInvoicedData();
    dailyData.forEach(day => {
      csvContent += `"${day.date}",${day.count},${day.amount.toFixed(2)}\n`;
    });
    csvContent += `\n`;
    
    csvContent += `ITEMIZED DEDUCTIBLE EXPENSES\n`;
    csvContent += `Date,Category,Payment Method,Description,Amount\n`;
    periodExpenses.forEach(exp => {
      csvContent += `"${exp.date}","${exp.category}","${exp.paymentMethod || 'Cash'}","${(exp.description || '').replace(/"/g, '""')}",${exp.amount.toFixed(2)}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Tax_Summary_Report_${activeYearStr}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const exportInvoiceJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(invoice, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Invoice_${(invoice.studentName || 'Draft').replace(/\s+/g, '_')}_${invoice.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleJsonImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string) as InvoiceData;
        if (!parsed.id || !parsed.lessons) {
          alert("Invalid invoice JSON format.");
          return;
        }
        const prepared = {
          ...parsed,
          coachAbn: parsed.coachAbn || DEFAULT_COACH_ABN,
          coachName: parsed.coachName || DEFAULT_COACH_NAME,
          coachEmail: parsed.coachEmail || DEFAULT_COACH_EMAIL,
        };
        setInvoice(prepared);
        saveInvoiceToHistory(prepared);
        alert("Invoice draft imported successfully!");
      } catch (err) {
        alert("Failed to parse JSON file.");
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const calculateTotalAmount = (lessons: Lesson[], rate: number, appliedCredit: number = 0): number => {
    const subtotal = lessons.reduce((sum, lesson) => {
      if (lesson.type === 'Credit') {
        return sum - (lesson.creditAmount || 0);
      }
      if (lesson.customPrice !== undefined) {
        return sum + lesson.customPrice;
      }
      const hours = parseDurationToHours(lesson.duration);
      const multiplier = lesson.type === '6-Week Cycle' ? 6 : 1;
      return sum + (hours * rate * multiplier);
    }, 0);
    return Math.max(0, subtotal - appliedCredit);
  };

  const calculateCycleDates = (startDateStr: string): string[] => {
    const dates: string[] = [];
    if (!startDateStr) return dates;
    const start = new Date(startDateStr);
    if (isNaN(start.getTime())) return dates;
    
    for (let i = 0; i < 6; i++) {
      const nextDate = new Date(start);
      nextDate.setDate(start.getDate() + i * 7);
      dates.push(nextDate.toISOString().split('T')[0]);
    }
    return dates;
  };

  const selectStudentForInvoice = (student: Student) => {
    setInvoice(prev => {
      const newRate = student.rate || 110;
      return { 
        ...prev, 
        studentId: student.id,
        studentName: student.name,
        parentName: student.parentName,
        email: student.email,
        rate: newRate,
        appliedCredit: 0,
        amount: calculateTotalAmount(prev.lessons, newRate, 0)
      };
    });
    setView('invoice');
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setInvoice(prev => {
      const updated = {
        ...prev,
        [name]: name === 'amount' || name === 'rate' || name === 'appliedCredit' ? parseFloat(value) || 0 : value 
      };
      if (name === 'rate') {
        updated.amount = calculateTotalAmount(prev.lessons, parseFloat(value) || 0, prev.appliedCredit);
      } else if (name === 'appliedCredit') {
        updated.amount = calculateTotalAmount(prev.lessons, prev.rate, parseFloat(value) || 0);
      }
      return updated;
    });
  };

  const addLesson = () => {
    const newLesson: Lesson = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      time: '10:00',
      duration: '60 min',
      type: 'Single',
      name: 'Private Ice Skating Lesson'
    };
    
    setInvoice(prev => {
      const newLessons = [...prev.lessons, newLesson];
      return {
        ...prev,
        lessons: newLessons,
        amount: calculateTotalAmount(newLessons, prev.rate, prev.appliedCredit)
      };
    });
  };

  const duplicateLesson = (id: string) => {
    setInvoice(prev => {
      const lessonToCopy = prev.lessons.find(l => l.id === id);
      if (!lessonToCopy) return prev;
      
      const duplicated: Lesson = {
        ...lessonToCopy,
        id: (Date.now() + Math.random()).toString(),
      };
      const index = prev.lessons.findIndex(l => l.id === id);
      const newLessons = [...prev.lessons];
      newLessons.splice(index + 1, 0, duplicated);
      
      return {
        ...prev,
        lessons: newLessons,
        amount: calculateTotalAmount(newLessons, prev.rate, prev.appliedCredit)
      };
    });
  };

  const removeLesson = (id: string) => {
    if (invoice.lessons.length <= 1) return;
    setInvoice(prev => {
      const newLessons = prev.lessons.filter(l => l.id !== id);
      return {
        ...prev,
        lessons: newLessons,
        amount: calculateTotalAmount(newLessons, prev.rate, prev.appliedCredit)
      };
    });
  };

  const updateLesson = (id: string, field: keyof Lesson, value: any) => {
    setInvoice(prev => {
      const newLessons = prev.lessons.map(l => {
        if (l.id !== id) return l;
        const updatedLesson = { ...l, [field]: value };
        if (field === 'type') {
          if (value === '6-Week Cycle') {
            updatedLesson.cycleDates = calculateCycleDates(updatedLesson.date);
            if (!l.name || l.name === 'Private Ice Skating Lesson' || l.name === 'Sickness Credit') {
              updatedLesson.name = '6-week Private Lesson Package';
            }
          } else if (value === 'Single') {
            if (!l.name || l.name === '6-week Private Lesson Package' || l.name === 'Sickness Credit') {
              updatedLesson.name = 'Private Ice Skating Lesson';
            }
          } else if (value === 'Credit') {
            updatedLesson.creditAmount = 50;
            if (!l.name || l.name === 'Private Ice Skating Lesson' || l.name === '6-week Private Lesson Package') {
              updatedLesson.name = 'Sickness Credit';
            }
          }
        } else if (field === 'date' && l.type === '6-Week Cycle') {
          updatedLesson.cycleDates = calculateCycleDates(value);
        }
        return updatedLesson;
      });
      return {
        ...prev,
        lessons: newLessons,
        amount: calculateTotalAmount(newLessons, prev.rate, prev.appliedCredit)
      };
    });
  };

  const saveCoachInfo = () => {
    localStorage.setItem('skating_coach_info', JSON.stringify({
      name: invoice.coachName,
      email: invoice.coachEmail,
      abn: invoice.coachAbn
    }));
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const downloadImage = async () => {
    if (!invoiceRef.current) return;
    setIsGeneratingImg(true);
    
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(invoiceRef.current, {
        quality: 1,
        pixelRatio: 3,
        backgroundColor: '#ffffff'
      });
      
      const link = document.createElement('a');
      link.download = `Invoice_${invoice.studentName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
      
      saveInvoiceToHistory(invoice);
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Error generating Image:', error);
      alert('Error generating Image. Please see console for details.');
    } finally {
      setIsGeneratingImg(false);
    }
  };

  const downloadPDF = async () => {
    if (!invoiceRef.current) return;
    setIsGenerating(true);
    
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(invoiceRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Invoice_${invoice.studentName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      
      saveInvoiceToHistory(invoice);
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please see console for details.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Active period calculations for rendering the Tax Hub
  const activeYearStr = selectedTaxYear || (new Date().getMonth() >= 6 ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`);
  const activeRange = getTaxPeriodRange(activeYearStr, taxPeriodType);

  const periodInvoices = invoiceHistory.filter(inv => {
    const invDate = inv.savedAt ? new Date(inv.savedAt) : new Date();
    return invDate >= activeRange.start && invDate <= activeRange.end;
  });

  const periodExpenses = taxExpenses.filter(exp => {
    const expDate = new Date(exp.date + 'T12:00:00');
    return expDate >= activeRange.start && expDate <= activeRange.end;
  });

  const grossRevenue = periodInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  const totalGST = grossRevenue / 11;
  const totalExpensesAmount = periodExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  const netTaxableIncome = Math.max(0, grossRevenue - totalExpensesAmount - totalGST);

  // Personal income tax calculations (Stage 3 progressive brackets)
  const bracket1Limit = 18200;
  const bracket2Limit = 45000;
  const bracket3Limit = 135000;
  const bracket4Limit = 190000;
  
  const b1Amt = Math.min(netTaxableIncome, bracket1Limit);
  const b2Amt = Math.max(0, Math.min(netTaxableIncome, bracket2Limit) - bracket1Limit);
  const b3Amt = Math.max(0, Math.min(netTaxableIncome, bracket3Limit) - bracket2Limit);
  const b4Amt = Math.max(0, Math.min(netTaxableIncome, bracket4Limit) - bracket3Limit);
  const b5Amt = Math.max(0, netTaxableIncome - bracket4Limit);
  
  const b1Tax = 0;
  const b2Tax = b2Amt * 0.16;
  const b3Tax = b3Amt * 0.30;
  const b4Tax = b4Amt * 0.37;
  const b5Tax = b5Amt * 0.45;
  
  const estIncomeTax = b1Tax + b2Tax + b3Tax + b4Tax + b5Tax;

  const medicareLevy = netTaxableIncome * 0.02;
  const totalTaxDeduction = estIncomeTax + medicareLevy;
  const effectiveTaxRate = netTaxableIncome > 0 ? (totalTaxDeduction / netTaxableIncome) * 100 : 0;
  const netProfitAfterTax = Math.max(0, netTaxableIncome - totalTaxDeduction);
  const takeHomePercentage = netTaxableIncome > 0 ? (netProfitAfterTax / netTaxableIncome) * 100 : 100;

  // Filter and sort functions for review
  const uniqueCategories = Array.from(new Set(
    taxExpenses
      .filter(exp => {
        const expDate = new Date(exp.date + 'T12:00:00');
        return expDate >= activeRange.start && expDate <= activeRange.end;
      })
      .map(exp => exp.category || 'Other')
  )).filter(Boolean);

  const filteredAndSortedExpenses = (() => {
    let list = taxExpenses.filter(exp => {
      const expDate = new Date(exp.date + 'T12:00:00');
      return expDate >= activeRange.start && expDate <= activeRange.end;
    });

    if (expenseSearch.trim()) {
      const q = expenseSearch.toLowerCase().trim();
      list = list.filter(exp => 
        (exp.description || '').toLowerCase().includes(q) || 
        (exp.category || '').toLowerCase().includes(q)
      );
    }

    if (expenseCategoryFilter && expenseCategoryFilter !== 'All') {
      list = list.filter(exp => exp.category === expenseCategoryFilter);
    }

    list.sort((a, b) => {
      if (expenseSortBy === 'date-desc') {
        return b.date.localeCompare(a.date);
      } else if (expenseSortBy === 'date-asc') {
        return a.date.localeCompare(b.date);
      } else if (expenseSortBy === 'amount-desc') {
        return b.amount - a.amount;
      } else if (expenseSortBy === 'amount-asc') {
        return a.amount - b.amount;
      }
      return 0;
    });

    return list;
  })();

  const getFilteredDailyInvoicedData = () => {
    const dailyMap: Record<string, { date: string; amount: number; count: number; invoices: InvoiceData[] }> = {};

    let periodInvoices = invoiceHistory.filter(inv => {
      const invDate = inv.savedAt ? new Date(inv.savedAt) : new Date();
      return invDate >= activeRange.start && invDate <= activeRange.end;
    });

    if (incomeSearch.trim()) {
      const q = incomeSearch.toLowerCase().trim();
      periodInvoices = periodInvoices.filter(inv => 
        (inv.studentName || '').toLowerCase().includes(q) || 
        (inv.notes || '').toLowerCase().includes(q) ||
        (inv.id || '').toLowerCase().includes(q)
      );
    }

    periodInvoices.forEach(inv => {
      const dayStr = inv.savedAt 
        ? getLocalDateString(new Date(inv.savedAt))
        : getLocalDateString();
        
      if (!dailyMap[dayStr]) {
        dailyMap[dayStr] = {
          date: dayStr,
          amount: 0,
          count: 0,
          invoices: []
        };
      }
      
      dailyMap[dayStr].amount += Number(inv.amount || 0);
      dailyMap[dayStr].count += 1;
      dailyMap[dayStr].invoices.push(inv);
    });
    
    const list = Object.values(dailyMap);

    list.sort((a, b) => {
      if (incomeSortBy === 'date-desc') {
        return b.date.localeCompare(a.date);
      } else if (incomeSortBy === 'date-asc') {
        return a.date.localeCompare(b.date);
      } else if (incomeSortBy === 'amount-desc') {
        return b.amount - a.amount;
      } else if (incomeSortBy === 'amount-asc') {
        return a.amount - b.amount;
      }
      return 0;
    });

    return list;
  };

  const monthlyData = getMonthlyBreakdown();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-4 relative z-50">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">CoachLedger</h1>
            <p className="text-slate-500">Fast invoicing for sports coaches</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Google Drive Sync Pill */}
            <div 
              onClick={() => setShowGoogleConfig(!showGoogleConfig)}
              className={`flex items-center gap-2 px-4 py-2 bg-white rounded-2xl shadow-sm border border-slate-100 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-50/50 hover:border-slate-200 transition-all cursor-pointer select-none active:scale-95`}
            >
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${googleToken ? (isSyncing ? 'bg-amber-400' : 'bg-green-400') : 'bg-slate-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${googleToken ? (isSyncing ? 'bg-amber-500' : 'bg-green-500') : 'bg-slate-400'}`}></span>
              </span>
              <span>{googleToken ? (isSyncing ? 'Syncing...' : 'Cloud Synced') : 'Cloud Offline'}</span>
            </div>

            {/* View Selector Tabs */}
            <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100 gap-1">
              <button 
                onClick={() => setView('invoice')}
                className={`px-4 md:px-6 py-2 rounded-xl font-medium transition-all flex items-center gap-2 ${view === 'invoice' ? 'bg-blue-600 text-white shadow-md shadow-blue-150' : 'text-slate-500 hover:bg-slate-50 cursor-pointer'}`}
              >
                <FileText className="w-4 h-4" />
                <span>Invoice</span>
              </button>
              <button 
                onClick={() => setView('students')}
                className={`px-4 md:px-6 py-2 rounded-xl font-medium transition-all flex items-center gap-2 ${view === 'students' ? 'bg-blue-600 text-white shadow-md shadow-blue-150' : 'text-slate-500 hover:bg-slate-50 cursor-pointer'}`}
              >
                <User className="w-4 h-4" />
                <span>Students</span>
              </button>
              <button 
                onClick={() => setView('tax')}
                className={`px-4 md:px-6 py-2 rounded-xl font-medium transition-all flex items-center gap-2 ${view === 'tax' ? 'bg-blue-600 text-white shadow-md shadow-blue-150' : 'text-slate-500 hover:bg-slate-50 cursor-pointer'}`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Tax Hub</span>
              </button>
            </div>
          </div>
        </header>

        {/* Floating Google Drive Sync Setup Dropdown */}
        <AnimatePresence>
          {showGoogleConfig && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white p-5 rounded-3xl shadow-xl border border-slate-200/80 max-w-sm ml-auto mb-8 space-y-4 animate-[fadeIn_0.15s_ease-out] relative z-40"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-blue-50 text-blue-600 rounded flex items-center justify-center font-bold text-xs">
                    G
                  </div>
                  <h3 className="font-extrabold text-sm text-slate-800">Google Drive Sync Setup</h3>
                </div>
                <button 
                  onClick={() => setShowGoogleConfig(false)}
                  className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-600">
                <p className="leading-relaxed">
                  Connect your personal Google Account to sync all invoicing, expenses, and records securely inside a dedicated JSON file in your Google Drive.
                </p>
                
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Google OAuth Client ID</label>
                  <input
                    type="text"
                    placeholder="Enter Google Client ID here..."
                    value={googleClientId}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      setGoogleClientId(val);
                      localStorage.setItem('skating_google_client_id', val);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none font-mono text-[9px] transition-all text-slate-700"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Google OAuth Client Secret</label>
                  <input
                    type="password"
                    placeholder="Enter Google Client Secret here..."
                    value={googleClientSecret}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      setGoogleClientSecret(val);
                      localStorage.setItem('skating_google_client_secret', val);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none font-mono text-[9px] transition-all text-slate-700"
                  />
                </div>

                {deviceUserCode && (
                  <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl space-y-2 text-center shadow-inner">
                    <div className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Device Authorization Required</div>
                    <div className="text-[9px] text-slate-500">Go to Google's device page and enter this code:</div>
                    <div className="text-xl font-black tracking-widest text-slate-800 bg-white py-1.5 px-4 rounded-xl border border-amber-200 inline-block font-mono select-all shadow-sm">{deviceUserCode}</div>
                    <button
                      onClick={() => window.open(deviceVerificationUri || 'https://google.com/device', '_blank')}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer block text-center active:scale-95 shadow-sm"
                    >
                      Open Google Device Page
                    </button>
                    <div className="text-[8px] text-slate-400 font-bold animate-pulse">⏳ Waiting for confirmation...</div>
                  </div>
                )}

                <div className="text-[10px] text-slate-500 leading-normal bg-blue-50/50 p-3 rounded-2xl border border-blue-100/60 space-y-1">
                  <div className="font-bold text-blue-800">Google Console Configuration:</div>
                  <div className="text-[9px] text-slate-400 leading-relaxed">
                    {window.location.origin === 'null' || window.location.origin.startsWith('file:') || (window.location.origin.includes('localhost') && !window.location.port) ? (
                      <span className="text-blue-900 font-bold">Tablet App: Create a "Desktop app" Client ID in Google Cloud Console. No redirect URIs are required!</span>
                    ) : (
                      <>
                        <span>Web App: Add this Authorized Redirect URI inside your Web Client ID:</span>
                        <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200/50 block font-mono text-[9px] truncate select-all mt-1">{getRedirectUri()}</code>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                {googleToken ? (
                  <div className="flex-grow flex items-center justify-between gap-2">
                    <button
                      onClick={() => triggerGoogleSync()}
                      disabled={isSyncing}
                      className="flex-grow py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer shadow-md shadow-blue-100"
                    >
                      <span>{isSyncing ? 'Syncing...' : 'Sync Now 🔄'}</span>
                    </button>
                    <button
                      onClick={handleGoogleLogout}
                      className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-2xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleGoogleLogin}
                    className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12 5.04c1.86 0 3.32.64 4.54 1.8l3.38-3.38A13.43 13.43 0 0 0 12 0C7.28 0 3.25 2.72 1.34 6.7l3.96 3.07C6.27 6.8 8.9 5.04 12 5.04z"/>
                      <path fill="#4285F4" d="M23.5 12.25c0-.82-.07-1.61-.21-2.38H12v4.51h6.45c-.28 1.48-1.12 2.73-2.38 3.58l3.69 2.87c2.16-2 3.74-4.94 3.74-8.58z"/>
                      <path fill="#FBBC05" d="M5.3 14.37A7.2 7.2 0 0 1 4.96 12c0-.82.12-1.61.34-2.37L1.34 6.56A11.96 11.96 0 0 0 0 12c0 1.98.48 3.86 1.34 5.5l3.96-3.13z"/>
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.69-2.87c-1.02.68-2.33 1.09-4.25 1.09-3.1 0-5.73-1.76-6.7-4.59L1.34 17.8A11.96 11.96 0 0 0 12 24z"/>
                    </svg>
                    <span>Connect Google Account</span>
                  </button>
                )}
              </div>

              {googleToken && (
                <div className="space-y-2 border-t border-slate-100 pt-3 text-[10px]">
                  <div className="font-bold text-slate-400 uppercase tracking-wider text-[9px]">Emergency Tools</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={deduplicateInvoicesAndExpenses}
                      className="py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-750 border border-emerald-200 rounded-xl font-bold transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer shadow-sm shadow-emerald-50/50"
                      title="Scan and remove identical duplicate entries from this device"
                    >
                      Clean Duplicates ✨
                    </button>
                    <button
                      onClick={() => forceUploadLocalToGoogle()}
                      disabled={isSyncing}
                      className="py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-750 border border-rose-200 rounded-xl font-bold transition-all flex items-center justify-center gap-1 active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm shadow-rose-50/50"
                      title="Overwrite Google Drive cloud backup with your clean local data"
                    >
                      Force Overwrite Drive 📤
                    </button>
                  </div>
                </div>
              )}

              {syncMessage && (
                <p className="text-[10px] font-semibold text-slate-500 leading-normal bg-slate-50 p-2.5 rounded-2xl border border-slate-200/50">
                  {syncMessage}
                </p>
              )}
              {lastSyncTime && !isSyncing && (
                <p className="text-[9px] text-slate-400 text-center font-medium">
                  Last synced: {lastSyncTime}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {view === 'students' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Student Form */}
            <div className="lg:col-span-1 space-y-6">
              <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  {editingStudentId ? 'Edit Student' : 'Add New Student'}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Student Name</label>
                    <input 
                      type="text" 
                      value={newStudent.name}
                      onChange={(e) => setNewStudent(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all"
                      placeholder="e.g. Jane Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Parent Name</label>
                    <input 
                      type="text" 
                      value={newStudent.parentName}
                      onChange={(e) => setNewStudent(prev => ({ ...prev, parentName: e.target.value }))}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all"
                      placeholder="e.g. Mary Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Email</label>
                    <input 
                      type="email" 
                      value={newStudent.email}
                      onChange={(e) => setNewStudent(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all"
                      placeholder="parent@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Phone</label>
                    <input 
                      type="text" 
                      value={newStudent.phone}
                      onChange={(e) => setNewStudent(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all"
                      placeholder="555-0123"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Hourly Rate ($)</label>
                      <input 
                        type="number" 
                        value={newStudent.rate}
                        onChange={(e) => setNewStudent(prev => ({ ...prev, rate: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Saved Credit ($)</label>
                      <input 
                        type="number" 
                        value={newStudent.credit}
                        onChange={(e) => setNewStudent(prev => ({ ...prev, credit: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={addOrUpdateStudent}
                    className="w-full py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                  >
                    {editingStudentId ? 'Update Student' : 'Add Student'}
                  </button>
                  {editingStudentId && (
                    <button 
                      onClick={() => {
                        setEditingStudentId(null);
                        setNewStudent({ name: '', parentName: '', email: '', phone: '', rate: 110, credit: 0 });
                      }}
                      className="w-full py-2 text-slate-500 font-medium"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </section>

              <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Download className="w-5 h-5 text-green-600" />
                  Import CSV
                </h2>
                <p className="text-sm text-slate-500 mb-4">Format: Name, Parent, Email, Phone, Rate</p>
                <input 
                  type="file" 
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleCsvImport}
                  className="hidden"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-slate-500 font-medium hover:border-blue-400 hover:text-blue-600 transition-all"
                >
                  Choose CSV File
                </button>
              </section>
            </div>

            {/* Student List */}
            <div className="lg:col-span-2">
              <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 min-h-[600px]">
                <h2 className="text-xl font-bold mb-6">Student Database ({students.length})</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left border-bottom border-slate-100">
                        <th className="pb-4 text-xs font-bold text-slate-400 uppercase">Student</th>
                        <th className="pb-4 text-xs font-bold text-slate-400 uppercase">Parent</th>
                        <th className="pb-4 text-xs font-bold text-slate-400 uppercase">Contact</th>
                        <th className="pb-4 text-xs font-bold text-slate-400 uppercase">Rate</th>
                        <th className="pb-4 text-xs font-bold text-slate-400 uppercase">Credit</th>
                        <th className="pb-4 text-xs font-bold text-slate-400 uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {students.map(student => (
                        <tr key={student.id} className="group hover:bg-slate-50 transition-colors">
                          <td className="py-4">
                            <button 
                              onClick={() => selectStudentForInvoice(student)}
                              className="font-bold text-blue-600 hover:underline text-left"
                            >
                              {student.name}
                            </button>
                          </td>
                          <td className="py-4 text-slate-600">{student.parentName || '-'}</td>
                          <td className="py-4">
                            <div className="text-sm text-slate-600">{student.email}</div>
                            <div className="text-xs text-slate-400">{student.phone}</div>
                          </td>
                          <td className="py-4 font-semibold text-slate-700">${student.rate}/hr</td>
                          <td className="py-4">
                            {student.credit && student.credit > 0 ? (
                              <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-bold text-xs">
                                ${student.credit}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-semibold text-sm">$0</span>
                            )}
                          </td>
                          <td className="py-4 text-right space-x-2">
                            <button 
                              onClick={() => editStudent(student)}
                              className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => removeStudent(student.id)}
                              className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-20 text-center text-slate-400 italic">
                            No students found. Add one manually or import a CSV.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        ) : view === 'tax' ? (
          <div className="space-y-8 animate-[fadeIn_0.3s_ease-out]">
            {/* Top Controls & Header */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                  Tax summary Hub
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  Track daily invoice income, log business expenses, and monitor tax obligations.
                </p>
              </div>

              {/* Filter Panel */}
              <div className="flex flex-wrap items-center gap-4">
                {/* CY / FY Switcher */}
                <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
                  <button 
                    onClick={() => setTaxPeriodType('FY')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${taxPeriodType === 'FY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Financial Year
                  </button>
                  <button 
                    onClick={() => setTaxPeriodType('CY')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${taxPeriodType === 'CY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Calendar Year
                  </button>
                </div>

                {/* Selected Year Dropdown */}
                <select 
                  value={selectedTaxYear}
                  onChange={(e) => setSelectedTaxYear(e.target.value)}
                  className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none cursor-pointer"
                >
                  {getTaxYearOptions(taxPeriodType).map(opt => (
                    <option key={opt} value={opt}>
                      {taxPeriodType === 'FY' ? `FY ${opt}` : opt}
                    </option>
                  ))}
                </select>

                {/* Export & Import Buttons */}
                <div className="flex gap-2">
                  <input 
                    type="file" 
                    accept="*/*"
                    ref={taxCsvFileInputRef}
                    onChange={handleTaxCsvImport}
                    className="hidden"
                  />
                  <button 
                    onClick={() => taxCsvFileInputRef.current?.click()}
                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    title="Import Income & Expenses CSV"
                  >
                    <Download className="w-4 h-4 rotate-180" />
                    <span>Import CSV</span>
                  </button>
                  <button 
                    onClick={downloadTaxPDF}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-100 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    title="Export PDF Report"
                  >
                    <Download className="w-4 h-4" />
                    <span>PDF</span>
                  </button>
                  <button 
                    onClick={downloadTaxCSV}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    title="Export CSV to Excel"
                  >
                    <FileText className="w-4 h-4" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Metrics Dashboard Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Gross earnings card */}
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl p-6 shadow-xl shadow-emerald-100/40 relative overflow-hidden flex flex-col justify-between min-h-[140px]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full translate-x-4 -translate-y-4"></div>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">Gross Invoiced Earnings</span>
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-black">${grossRevenue.toFixed(2)}</h3>
                  <p className="text-[10px] text-emerald-100 font-medium mt-1">Total revenue collected from invoices</p>
                </div>
              </div>

              {/* GST collected card */}
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-3xl p-6 shadow-xl shadow-blue-100/40 relative overflow-hidden flex flex-col justify-between min-h-[140px]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full translate-x-4 -translate-y-4"></div>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-100">GST collected (10%)</span>
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                    <Receipt className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-black">${totalGST.toFixed(2)}</h3>
                  <p className="text-[10px] text-blue-100 font-medium mt-1">Inclusive GST liability (1/11th of gross)</p>
                </div>
              </div>

              {/* Expenses card */}
              <div className="bg-gradient-to-br from-rose-500 to-pink-600 text-white rounded-3xl p-6 shadow-xl shadow-rose-100/40 relative overflow-hidden flex flex-col justify-between min-h-[140px]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full translate-x-4 -translate-y-4"></div>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-100">Business Expenses</span>
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 rotate-180" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-black">${totalExpensesAmount.toFixed(2)}</h3>
                  <p className="text-[10px] text-rose-100 font-medium mt-1">Tax-deductible operational deductions</p>
                </div>
              </div>

              {/* Net earnings card */}
              <div className="bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-3xl p-6 shadow-xl shadow-violet-100/40 relative overflow-hidden flex flex-col justify-between min-h-[140px]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full translate-x-4 -translate-y-4"></div>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold uppercase tracking-wider text-violet-100">Net Taxable Income</span>
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-black">${netTaxableIncome.toFixed(2)}</h3>
                  <p className="text-[10px] text-violet-100 font-medium mt-1">Excludes GST liabilities & expenses</p>
                </div>
              </div>
            </div>

            {/* Invoiced vs Expense SVG Charts & Gauges */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              {/* Monthly breakdown SVG Chart */}
              <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-slate-800">Monthly Revenue vs. Expense</h3>
                  <div className="flex items-center gap-4 text-xs font-bold">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-blue-600"></span>
                      <span className="text-slate-500">Gross Income</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                      <span className="text-slate-500">Expenses</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex-grow min-h-[240px] flex items-center justify-center">
                  {monthlyData.some(d => d.income > 0 || d.expenses > 0) ? (
                    <svg viewBox="0 0 600 220" className="w-full h-full max-h-[280px]">
                      {/* Grid Lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => (
                        <line 
                          key={idx}
                          x1="40" 
                          y1={170 - ratio * 140} 
                          x2="580" 
                          y2={170 - ratio * 140} 
                          stroke="#f1f5f9" 
                          strokeWidth="1.5" 
                        />
                      ))}
                      
                      {/* Render Bars */}
                      {monthlyData.map((d, idx) => {
                        const maxVal = Math.max(...monthlyData.map(dm => Math.max(dm.income, dm.expenses)), 100);
                        const x = 50 + idx * 44;
                        const incomeHeight = (d.income / maxVal) * 140;
                        const expensesHeight = (d.expenses / maxVal) * 140;
                        
                        return (
                          <g key={d.key} className="group/bar">
                            {/* Income Bar (Blue-600) */}
                            <rect 
                              x={x} 
                              y={170 - incomeHeight} 
                              width="12" 
                              height={incomeHeight} 
                              rx="3"
                              fill="url(#incomeGradient)"
                              className="transition-all duration-300 hover:opacity-90 cursor-pointer"
                            >
                              <title>{`Income: $${d.income.toFixed(2)}`}</title>
                            </rect>
                            
                            {/* Expense Bar (Rose-500) */}
                            <rect 
                              x={x + 15} 
                              y={170 - expensesHeight} 
                              width="12" 
                              height={expensesHeight} 
                              rx="3"
                              fill="url(#expenseGradient)"
                              className="transition-all duration-300 hover:opacity-90 cursor-pointer"
                            >
                              <title>{`Expenses: $${d.expenses.toFixed(2)}`}</title>
                            </rect>
                            
                            {/* Month Label */}
                            <text 
                              x={x + 13} 
                              y="192" 
                              textAnchor="middle" 
                              className="text-[10px] font-bold fill-slate-400 font-sans"
                            >
                              {d.name.split(' ')[0]}
                            </text>
                            <text 
                              x={x + 13} 
                              y="204" 
                              textAnchor="middle" 
                              className="text-[9px] font-medium fill-slate-300 font-mono"
                            >
                              '{d.name.split(' ')[1]}
                            </text>
                          </g>
                        );
                      })}
                      
                      {/* SVG Defs for Gradients */}
                      <defs>
                        <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#2563eb" />
                        </linearGradient>
                        <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" />
                          <stop offset="100%" stopColor="#e11d48" />
                        </linearGradient>
                      </defs>
                    </svg>
                  ) : (
                    <div className="text-center text-slate-400 font-medium italic">
                      No income or expenses recorded in this tax period to plot.
                    </div>
                  )}
                </div>
              </div>

              {/* Expense Category distribution gauge */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-indigo-500" />
                    Expenses by Category
                  </h3>
                  
                  <div className="space-y-4">
                    {(() => {
                      const breakdown = getCategoryBreakdown();
                      const colors = [
                        { bg: 'bg-blue-500', text: 'text-blue-600' },
                        { bg: 'bg-purple-500', text: 'text-purple-600' },
                        { bg: 'bg-amber-500', text: 'text-amber-600' },
                        { bg: 'bg-emerald-500', text: 'text-emerald-600' },
                        { bg: 'bg-rose-500', text: 'text-rose-600' },
                        { bg: 'bg-teal-500', text: 'text-teal-600' },
                        { bg: 'bg-indigo-500', text: 'text-indigo-600' },
                        { bg: 'bg-pink-500', text: 'text-pink-600' }
                      ];
                      
                      const sortedBreakdown = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
                      
                      return sortedBreakdown.map(([cat, amount], idx) => {
                        const pct = totalExpensesAmount > 0 ? (amount / totalExpensesAmount) * 100 : 0;
                        const color = colors[idx % colors.length];
                        return (
                          <div key={cat} className="space-y-1">
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-600">{cat}</span>
                              <span className={color.text}>
                                ${amount.toFixed(2)} ({pct.toFixed(0)}%)
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${color.bg} transition-all duration-500`}
                                style={{ width: `${pct}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
                {totalExpensesAmount === 0 && (
                  <div className="text-xs text-center text-slate-400 italic mt-6">
                    Log expenses below to view distribution.
                  </div>
                )}
              </div>
            </div>

            {/* Australian Income Tax & Net Take-Home Profit Estimator */}
            <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 md:p-8 shadow-2xl relative overflow-hidden my-8">
              {/* Background accent light blur */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -translate-y-12 translate-x-12 pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl translate-y-12 -translate-x-12 pointer-events-none"></div>

              <div className="relative z-10 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-5 gap-4">
                  <div>
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                      <span className="text-2xl">🇦🇺</span> Est. Australian Income Tax & Profit
                    </h3>
                    <p className="text-xs text-slate-400 font-medium mt-1">Calculated using resident Stage 3 tax brackets for the selected period</p>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-800/80 border border-slate-700 text-slate-300 rounded-full text-xs font-black">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>FY 2025–26 Tax Rates</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
                  {/* Left Column: Metrics and bars */}
                  <div className="lg:col-span-2 space-y-6 flex flex-col justify-between">
                    <div className="grid grid-cols-2 gap-4">
                      {/* Sub-item: Net Taxable Income */}
                      <div className="bg-slate-950/50 border border-slate-800/60 rounded-2xl p-4">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Net Taxable Income</span>
                        <span className="text-xl font-extrabold text-slate-200 mt-1 block">${netTaxableIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      
                      {/* Sub-item: Effective Tax Rate */}
                      <div className="bg-slate-950/50 border border-slate-800/60 rounded-2xl p-4">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Effective Tax Rate</span>
                        <span className="text-xl font-extrabold text-slate-200 mt-1 block">{effectiveTaxRate.toFixed(1)}%</span>
                      </div>
                    </div>

                    {/* Stacked visually stunning keeping/tax ratio progress bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-emerald-400">Net Take-Home ({takeHomePercentage.toFixed(0)}%)</span>
                        <span className="text-rose-400">Total Tax ({effectiveTaxRate.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full h-4 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800/80">
                        {netTaxableIncome > 0 ? (
                          <>
                            <div 
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-500" 
                              style={{ width: `${takeHomePercentage}%` }}
                              title={`Take-home: ${takeHomePercentage.toFixed(1)}%`}
                            ></div>
                            <div 
                              className="h-full bg-gradient-to-r from-rose-500 to-pink-600 transition-all duration-500" 
                              style={{ width: `${effectiveTaxRate}%` }}
                              title={`Tax: ${effectiveTaxRate.toFixed(1)}%`}
                            ></div>
                          </>
                        ) : (
                          <div className="w-full h-full bg-slate-800" title="No income recorded"></div>
                        )}
                      </div>
                    </div>

                    {/* Progressive Tax Brackets Ledger Table */}
                    <div className="space-y-2.5 text-xs bg-slate-950/40 p-4 border border-slate-800/60 rounded-2xl">
                      <div className="flex justify-between border-b border-slate-800/50 pb-2 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                        <span>Income Tax Brackets (Stage 3)</span>
                        <span>Taxable portion</span>
                        <span className="text-right">Estimated Tax</span>
                      </div>
                      <div className="flex justify-between text-slate-300 font-medium font-mono text-[11px]">
                        <span className="w-1/2 text-slate-500 font-sans">$0 – $18,200 @ 0%</span>
                        <span className="text-slate-400 font-semibold">${b1Amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="w-1/4 text-right text-slate-400 font-bold">$0.00</span>
                      </div>
                      <div className={`flex justify-between font-mono text-[11px] ${b2Amt > 0 ? 'text-indigo-200' : 'text-slate-600'}`}>
                        <span className="w-1/2 font-sans">$18,201 – $45,000 @ 16%</span>
                        <span className="font-semibold">${b2Amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="w-1/4 text-right font-bold">${b2Tax > 0 ? `$${b2Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}</span>
                      </div>
                      <div className={`flex justify-between font-mono text-[11px] ${b3Amt > 0 ? 'text-indigo-200' : 'text-slate-600'}`}>
                        <span className="w-1/2 font-sans">$45,001 – $135,000 @ 30%</span>
                        <span className="font-semibold">${b3Amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="w-1/4 text-right font-bold">${b3Tax > 0 ? `$${b3Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}</span>
                      </div>
                      <div className={`flex justify-between font-mono text-[11px] ${b4Amt > 0 ? 'text-indigo-200' : 'text-slate-600'}`}>
                        <span className="w-1/2 font-sans">$135,001 – $190,000 @ 37%</span>
                        <span className="font-semibold">${b4Amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="w-1/4 text-right font-bold">${b4Tax > 0 ? `$${b4Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}</span>
                      </div>
                      <div className={`flex justify-between font-mono text-[11px] ${b5Amt > 0 ? 'text-indigo-200' : 'text-slate-600'}`}>
                        <span className="w-1/2 font-sans">$190,001+ @ 45%</span>
                        <span className="font-semibold">${b5Amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="w-1/4 text-right font-bold">${b5Tax > 0 ? `$${b5Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}</span>
                      </div>
                      
                      <div className="flex justify-between text-slate-300 font-medium pt-2 border-t border-slate-800/40 text-[11px]">
                        <span>Medicare Levy (2.0% of total taxable)</span>
                        <span className="font-semibold font-mono">${medicareLevy.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>

                      <div className="flex justify-between text-rose-400 border-t border-slate-800/50 pt-2 font-bold text-xs">
                        <span>Total Estimated Tax Liability</span>
                        <span>-${totalTaxDeduction.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Hero Take-Home Profit Callout */}
                  <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-purple-950/40 border border-slate-800 rounded-3xl p-6 text-center space-y-4 flex flex-col justify-center items-center relative group">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Est. Take-Home Profit</span>
                      <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 mt-2 block select-all">
                        ${netProfitAfterTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <p className="text-[10px] text-slate-500 font-medium mt-2">Pure net profit after business costs, GST collected, and estimated personal income taxes have been cleared.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Dashboard Lower Row: Log Book & Invoicing Accordion */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column: Expense Log Book */}
              <div className="space-y-8">
                <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-6">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
                    <Receipt className="w-5 h-5 text-rose-500" />
                    Deductible Expense Log Book
                  </h3>
                  
                  {/* Expense Input fields form */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Expense Date</label>
                        <input 
                          type="date" 
                          value={newExpense.date}
                          onChange={(e) => setNewExpense(prev => ({ ...prev, date: e.target.value }))}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Category</label>
                        <input 
                          type="text" 
                          list="expense-categories"
                          value={newExpense.category || ''}
                          onChange={(e) => setNewExpense(prev => ({ ...prev, category: e.target.value }))}
                          placeholder="e.g. Ice Hire, Equipment"
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold text-slate-700"
                        />
                        <datalist id="expense-categories">
                          <option value="Ice Hire" />
                          <option value="Equipment" />
                          <option value="Travel" />
                          <option value="Insurance" />
                          <option value="Marketing" />
                          <option value="Other" />
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Payment Method</label>
                        <input 
                          type="text" 
                          list="payment-methods"
                          value={newExpense.paymentMethod || ''}
                          onChange={(e) => setNewExpense(prev => ({ ...prev, paymentMethod: e.target.value }))}
                          placeholder="e.g. Cash, CBA, PayID"
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold text-slate-700"
                        />
                        <datalist id="payment-methods">
                          <option value="Cash" />
                          <option value="CBA" />
                          <option value="PayID" />
                          <option value="Bank Transfer" />
                          <option value="Credit Card" />
                        </datalist>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Deduction Amount ($)</label>
                        <input 
                          type="number" 
                          step="any"
                          value={newExpense.amount ?? ''}
                          onChange={(e) => setNewExpense(prev => ({ ...prev, amount: e.target.value }))}
                          placeholder="e.g. 45.00 or -45.00"
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold text-slate-700"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Expense Description</label>
                        <input 
                          type="text" 
                          value={newExpense.description || ''}
                          onChange={(e) => setNewExpense(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="e.g. Rink hire 1 hour private lesson"
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold text-slate-700"
                        />
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={addExpense}
                    className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold shadow-lg shadow-rose-100 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Record Deductible Expense</span>
                  </button>

                  {/* Expense Table Filters */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 pt-4">
                    {/* Search */}
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input 
                        type="text"
                        value={expenseSearch}
                        onChange={(e) => setExpenseSearch(e.target.value)}
                        placeholder="Search description..."
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-xs font-semibold text-slate-700"
                      />
                    </div>
                    {/* Category Filter */}
                    <div>
                      <select
                        value={expenseCategoryFilter}
                        onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-xs font-semibold text-slate-700"
                      >
                        <option value="All">All Categories</option>
                        {uniqueCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    {/* Sort By */}
                    <div>
                      <select
                        value={expenseSortBy}
                        onChange={(e) => setExpenseSortBy(e.target.value as any)}
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-xs font-semibold text-slate-700"
                      >
                        <option value="date-desc">Newest Date</option>
                        <option value="date-asc">Oldest Date</option>
                        <option value="amount-desc">Highest Amount</option>
                        <option value="amount-asc">Lowest Amount</option>
                      </select>
                    </div>
                  </div>

                  {/* Expenses List Table */}
                  <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                    <div className="max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200">
                            <th className="p-3 font-bold text-slate-500">DATE</th>
                            <th className="p-3 font-bold text-slate-500">CATEGORY</th>
                            <th className="p-3 font-bold text-slate-500">METHOD</th>
                            <th className="p-3 font-bold text-slate-500">DESCRIPTION</th>
                            <th className="p-3 font-bold text-slate-500 text-right">AMOUNT</th>
                            <th className="p-3 font-bold text-slate-500 text-center">ACTION</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150">
                          {filteredAndSortedExpenses.map(exp => (
                            <tr key={exp.id} className="group hover:bg-white transition-colors">
                              <td className="p-3 font-semibold text-slate-600 whitespace-nowrap">
                                {exp.date}
                              </td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-full font-bold text-[10px] whitespace-nowrap">
                                  {exp.category}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-bold text-[10px] whitespace-nowrap">
                                  {exp.paymentMethod || 'Cash'}
                                </span>
                              </td>
                              <td className="p-3 font-medium text-slate-700 max-w-[120px] truncate" title={exp.description}>
                                {exp.description}
                              </td>
                              <td className="p-3 font-bold text-slate-800 text-right whitespace-nowrap">
                                ${exp.amount.toFixed(2)}
                              </td>
                              <td className="p-3 text-center">
                                <button 
                                  onClick={() => removeExpense(exp.id)}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-red-500 transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {filteredAndSortedExpenses.length === 0 && (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-slate-400 italic font-medium">
                                {expenseSearch.trim() || expenseCategoryFilter !== 'All' 
                                  ? "No expenses match your search/filter criteria."
                                  : "No deductible expenses logged in this period."}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              </div>

              {/* Right Column: Daily Invoiced earnings collapsible ledger */}
              <div className="space-y-8">
                <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4 min-h-[500px]">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
                    <Calendar className="w-5 h-5 text-blue-500" />
                    Daily Invoiced Earnings Tracker
                  </h3>
                  
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Review exactly how much money was invoiced on each working calendar day. Click a day to view individual invoices.
                  </p>

                  {/* Income Table Filters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                    {/* Search */}
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input 
                        type="text"
                        value={incomeSearch}
                        onChange={(e) => setIncomeSearch(e.target.value)}
                        placeholder="Search student or note..."
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-semibold text-slate-700 transition-all"
                      />
                    </div>
                    {/* Sort By */}
                    <div>
                      <select
                        value={incomeSortBy}
                        onChange={(e) => setIncomeSortBy(e.target.value as any)}
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-semibold text-slate-700 transition-all cursor-pointer"
                      >
                        <option value="date-desc">Newest Date</option>
                        <option value="date-asc">Oldest Date</option>
                        <option value="amount-desc">Highest Earnings</option>
                        <option value="amount-asc">Lowest Earnings</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1 custom-scrollbar">
                    {getFilteredDailyInvoicedData().map(day => {
                      const isExpanded = expandedTaxDay === day.date;
                      const dateObj = new Date(day.date + 'T12:00:00');
                      const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                      
                      return (
                        <div key={day.date} className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/30 hover:bg-slate-50/70 hover:border-slate-200 transition-all shadow-sm">
                          <div 
                            onClick={() => setExpandedTaxDay(isExpanded ? null : day.date)}
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-100/50 transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-extrabold text-sm border border-blue-100">
                                {day.count}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-700 text-sm">{formattedDate}</h4>
                                <p className="text-[10px] text-slate-400 font-semibold">{day.count} invoice(s)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-black text-slate-800 text-sm">${day.amount.toFixed(2)}</span>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>
                          
                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-white/70 p-3.5 space-y-2.5 animate-[fadeIn_0.15s_ease-out]">
                              {day.invoices.map(inv => (
                                <div key={inv.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100 shadow-sm hover:shadow transition-shadow">
                                  <div>
                                    <div className="font-bold text-slate-800 text-xs">{inv.studentName}</div>
                                    <div className="text-[9px] text-slate-400 font-mono mt-0.5">{inv.id}</div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-bold text-slate-700 text-xs">${inv.amount.toFixed(2)}</span>
                                    <button 
                                      onClick={() => {
                                        setInvoice(inv);
                                        setView('invoice');
                                      }}
                                      className="px-2.5 py-1 text-[9px] font-black text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all active:scale-95 cursor-pointer"
                                    >
                                      Load Draft
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {getFilteredDailyInvoicedData().length === 0 && (
                      <div className="text-center text-slate-400 italic py-20 font-medium">
                        {incomeSearch.trim() 
                          ? "No invoicing records match your search criteria."
                          : "No invoiced income recorded in this period."}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>

            {/* CSV Import History Panel */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-3 gap-2">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-500" />
                  CSV Import History & Rollback Log
                </h3>
                <span className="text-xs font-semibold text-slate-400">
                  Undo accidental uploads by rolling back any batch
                </span>
              </div>
              
              {csvImportsHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold text-xs uppercase tracking-wider">
                        <th className="py-3 px-4">Import Date</th>
                        <th className="py-3 px-4">File Name</th>
                        <th className="py-3 px-4 text-center">Invoices Added</th>
                        <th className="py-3 px-4 text-center">Expenses Added</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {csvImportsHistory.map((record) => (
                        <tr key={record.batchId} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-slate-600">{record.importDate}</td>
                          <td className="py-3.5 px-4 font-bold text-indigo-600 truncate max-w-[200px]" title={record.fileName}>
                            {record.fileName}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">
                              +{record.invoicesCount} Invoices
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="px-2 py-1 bg-rose-50 text-rose-700 rounded-full text-xs font-bold">
                              +{record.expensesCount} Expenses
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => rollbackCsvImport(record.batchId)}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 active:scale-95 cursor-pointer"
                              title="Delete/Rollback this CSV import"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Rollback</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm italic">
                  No CSV files have been imported yet. Use the "Import CSV" button at the top to upload financial records.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left Column: Controls & Forms */}
            <div className="space-y-8">
              {/* Coach Settings */}
              <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                  <h2 className="text-lg font-semibold">Coach Profile</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Your Name</label>
                    <input 
                      type="text" 
                      name="coachName"
                      value={invoice.coachName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Your Email</label>
                    <input 
                      type="email" 
                      name="coachEmail"
                      value={invoice.coachEmail}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Your ABN</label>
                    <input 
                      type="text" 
                      name="coachAbn"
                      value={invoice.coachAbn}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>
                <button 
                  onClick={saveCoachInfo}
                  className="mt-4 flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save Profile Defaults
                </button>
              </section>

              {/* Daily Invoice Checklist */}
              <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                      <CheckSquare className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h2 className="text-lg font-semibold">Daily Invoice Checklist</h2>
                  </div>
                  <button 
                    onClick={() => setView('students')}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Manage All
                  </button>
                </div>

                {/* Checklist Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {/* Search box */}
                  <div className="relative flex items-center">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                    <input 
                      type="text"
                      placeholder="Search student..."
                      value={checklistSearch}
                      onChange={(e) => setChecklistSearch(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-semibold text-slate-700 placeholder-slate-400"
                    />
                    {checklistSearch && (
                      <button 
                        onClick={() => setChecklistSearch('')}
                        className="p-1 hover:bg-slate-100 rounded-full absolute right-2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Date selector picker */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-grow flex items-center">
                      <Calendar className="w-4 h-4 text-blue-500 absolute left-3 pointer-events-none" />
                      <input 
                        type="date"
                        value={selectedChecklistDate}
                        onChange={(e) => setSelectedChecklistDate(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-700 cursor-pointer"
                      />
                    </div>
                    {selectedChecklistDate !== getLocalDateString() && (
                      <button
                        onClick={() => setSelectedChecklistDate(getLocalDateString())}
                        className="px-2.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 rounded-xl text-xs font-extrabold transition-all duration-200"
                        title="Jump back to today"
                      >
                        Today
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center mb-4 text-xs">
                  <span className="text-slate-400 font-medium">Click name to select student</span>
                  <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {students.filter(s => invoiceHistory.some(inv => inv.studentName === s.name && (inv.savedAt ? getLocalDateString(new Date(inv.savedAt)) === selectedChecklistDate : false))).length}/{students.length} Done
                  </span>
                </div>
                
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-2 custom-scrollbar mb-4">
                  {sortedFilteredStudents.map(student => {
                    const studentInvoicesOnDate = invoiceHistory.filter(inv => {
                      const invDate = inv.savedAt 
                        ? getLocalDateString(new Date(inv.savedAt))
                        : getLocalDateString();
                      return inv.studentName === student.name && invDate === selectedChecklistDate;
                    });
                    const isDone = studentInvoicesOnDate.length > 0;
                    const isSelected = invoice.studentId === student.id;
                    const verification = getInvoiceVerification(student, selectedChecklistDate);
                    
                    return (
                      <div 
                        key={student.id}
                        className={`group flex flex-col gap-1.5 p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-blue-50 border-blue-200 text-blue-900 shadow-sm'
                            : isDone
                              ? 'bg-slate-50/50 border-slate-100 text-slate-400' 
                              : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300 shadow-sm hover:shadow'
                        }`}
                        onClick={() => selectStudentForInvoice(student)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                              isDone 
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' 
                                : 'bg-white border-slate-300 group-hover:border-blue-500'
                            }`}>
                              {isDone && <Check className="w-3.5 h-3.5 animate-[scaleIn_0.15s_ease-out]" />}
                            </div>
                            <span className={`text-sm font-semibold ${isDone ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                              {student.name}
                            </span>
                          </div>
                          <div>
                            {isDone ? (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                Done
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full group-hover:text-blue-600 group-hover:bg-blue-50 transition-colors">
                                Pending
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Double Check Verification Details */}
                        {isDone && (
                          <div className="pl-8 flex items-start gap-1">
                            {verification.status === 'correct' ? (
                              <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50/50 border border-emerald-100 px-2 py-0.5 rounded-md w-full">
                                <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{verification.details}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50/50 border border-amber-100 px-2 py-0.5 rounded-md w-full">
                                <AlertCircle className="w-3 h-3 flex-shrink-0 text-amber-600" />
                                <span className="truncate" title={verification.details}>{verification.message}: {verification.details}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {sortedFilteredStudents.length === 0 && (
                    <p className="text-sm text-slate-400 italic">
                      {students.length === 0 
                        ? "No students saved yet. Go to Students tab to add some." 
                        : "No students matching your search query."}
                    </p>
                  )}
                </div>

                {/* Google Keep Vibe Note Panel */}
                {students.length > 0 && (
                  <div className="bg-[#fef9c3]/80 border border-yellow-200 rounded-2xl p-4 shadow-sm relative overflow-hidden transition-all hover:bg-[#fef9c3] hover:shadow-md animate-[fadeIn_0.3s_ease-out]">
                    {/* Background Sticky Note Vibe */}
                    <div className="absolute top-0 right-0 w-8 h-8 bg-yellow-200/50 rounded-bl-3xl"></div>
                    
                    <div className="flex items-center gap-1.5 mb-2">
                      <StickyNote className="w-4 h-4 text-yellow-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-yellow-800">Google Keep Notes Sync</span>
                    </div>

                    <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                      Copy your daily student list in Keep-friendly checkbox formats to track in your personal organizer notes!
                    </p>

                    <div className="space-y-2">
                      <button 
                        onClick={() => copyToClipboard(getKeepChecklistText(), 'checklist')}
                        className="w-full py-2 bg-yellow-100 hover:bg-yellow-200 border border-yellow-300 text-yellow-900 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                      >
                        {copySuccess === 'checklist' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Copied Checklist!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Checklist Format</span>
                          </>
                        )}
                      </button>
                      
                      <button 
                        onClick={() => copyToClipboard(getKeepNamesText(), 'names')}
                        className="w-full py-2 bg-white/60 hover:bg-white border border-yellow-200 text-yellow-900 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                      >
                        {copySuccess === 'names' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Copied Student Names!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Names List Only</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Keep Preview Box */}
                    <div className="mt-3 p-2.5 bg-yellow-50/50 border border-yellow-100 rounded-xl text-[10px] text-yellow-900/80 font-mono leading-normal max-h-24 overflow-y-auto custom-scrollbar">
                      <div className="font-bold border-b border-yellow-200/50 pb-1 mb-1 text-[11px]">Clipboard Preview:</div>
                      {[...students].sort((a, b) => a.name.localeCompare(b.name)).map(s => {
                        const targetInvoices = invoiceHistory.filter(inv => {
                          const invDate = inv.savedAt 
                            ? getLocalDateString(new Date(inv.savedAt))
                            : getLocalDateString();
                          return inv.studentName === s.name && invDate === selectedChecklistDate;
                        });
                        const isDone = targetInvoices.length > 0;
                        return (
                          <div key={s.id} className="truncate">
                            {isDone ? '☑' : '☐'} {s.name} {isDone ? '✓' : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* Saved Invoices (Retrace Work) */}
              <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div className="space-y-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                        <History className="w-4 h-4 text-green-600" />
                      </div>
                      <h2 className="text-lg font-semibold animate-[fadeIn_0.2s_ease-out]">Invoices History</h2>
                    </div>
                    <button 
                      onClick={() => {
                        setInvoice({
                          id: `INV-${Date.now()}`,
                          studentId: '',
                          studentName: '',
                          parentName: '',
                          email: '',
                          lessons: [{
                            id: Date.now().toString(),
                            date: selectedChecklistDate,
                            time: '10:00',
                            duration: '60 min',
                            type: 'Single',
                            name: 'Private Ice Skating Lesson'
                          }],
                          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                          billingCycle: '6-week',
                          notes: 'Thank you for the lesson!',
                          paymentMethod: "Commonwealth Bank Australia\nWong Wing Nam\nBSB: 063-097\nAccount: 7273 8289\nPayID: 0405272775\nCash",
                          amount: 110,
                          coachName: invoice.coachName || DEFAULT_COACH_NAME,
                          coachEmail: invoice.coachEmail || DEFAULT_COACH_EMAIL,
                          coachAbn: invoice.coachAbn || DEFAULT_COACH_ABN,
                          term: 'Term 1.1',
                          rate: 110,
                          appliedCredit: 0
                        });
                      }}
                      className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      + New Invoice
                    </button>
                  </div>

                  {/* Scope Tabs */}
                  <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-semibold gap-0.5">
                    <button
                      onClick={() => setHistoryScope('date')}
                      className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${historyScope === 'date' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Selected Date
                    </button>
                    <button
                      onClick={() => setHistoryScope('all')}
                      className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${historyScope === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      All Saved ({invoiceHistory.length})
                    </button>
                  </div>

                  {/* Search bar inside Sidebar */}
                  {historyScope === 'all' && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search student or invoice ID..."
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border-none rounded-xl text-xs focus:ring-2 focus:ring-green-500 focus:bg-white transition-all outline-none"
                      />
                    </div>
                  )}
                </div>
                
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {(() => {
                    let filtered = invoiceHistory;
                    if (historyScope === 'date') {
                      filtered = filtered.filter(inv => {
                        const invDate = inv.savedAt 
                          ? getLocalDateString(new Date(inv.savedAt))
                          : getLocalDateString();
                        return invDate === selectedChecklistDate;
                      });
                    } else if (historySearch.trim()) {
                      const q = historySearch.toLowerCase().trim();
                      filtered = filtered.filter(inv => 
                        (inv.studentName || '').toLowerCase().includes(q) ||
                        (inv.id || '').toLowerCase().includes(q)
                      );
                    }
                    
                    return filtered.map((inv) => {
                      const formattedTime = inv.savedAt 
                        ? new Date(inv.savedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + new Date(inv.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Recently';
                      return (
                        <div 
                          key={inv.id} 
                          className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                            invoice.id === inv.id 
                              ? 'bg-blue-50 border-blue-200 shadow-sm' 
                              : 'bg-white border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          <div className="cursor-pointer flex-grow" onClick={() => setInvoice(inv)}>
                            <div className="font-bold text-slate-800 text-sm">{inv.studentName || 'Draft Invoice'}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-slate-500">{inv.id}</span>
                              <span>•</span>
                              <span>{formattedTime}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700 text-sm">${Number(inv.amount).toFixed(2)}</span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Are you sure you want to delete this invoice from history?\n\nID: ${inv.id}\nStudent: ${inv.studentName}`)) {
                                  setInvoiceHistory(prev => {
                                    const filteredList = prev.filter(i => i.id !== inv.id);
                                    localStorage.setItem('skating_invoice_history', JSON.stringify(filteredList));
                                    return filteredList;
                                  });
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                  
                  {(() => {
                    const filtered = invoiceHistory.filter(inv => {
                      if (historyScope === 'date') {
                        const invDate = inv.savedAt 
                          ? getLocalDateString(new Date(inv.savedAt))
                          : getLocalDateString();
                        return invDate === selectedChecklistDate;
                      } else {
                        if (!historySearch.trim()) return true;
                        const q = historySearch.toLowerCase().trim();
                        return (inv.studentName || '').toLowerCase().includes(q) || (inv.id || '').toLowerCase().includes(q);
                      }
                    });
                    
                    return filtered.length === 0 ? (
                      <p className="text-sm text-slate-400 italic py-6 text-center">
                        {historyScope === 'date' 
                          ? `No invoices recorded for ${selectedChecklistDate === getLocalDateString() ? "today" : selectedChecklistDate} yet.`
                          : "No saved invoices found."}
                      </p>
                    ) : null;
                  })()}
                </div>
                <input 
                  type="file" 
                  accept=".json"
                  ref={jsonFileInputRef}
                  onChange={handleJsonImport}
                  className="hidden"
                />

                <button 
                  onClick={() => saveInvoiceToHistory(invoice)}
                  className="w-full mt-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-all flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Current Draft
                </button>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button 
                    onClick={exportInvoiceJson}
                    className="py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-bold hover:bg-slate-100 transition-all flex items-center justify-center gap-1"
                  >
                    Export JSON
                  </button>
                  <button 
                    onClick={() => jsonFileInputRef.current?.click()}
                    className="py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-bold hover:bg-slate-100 transition-all flex items-center justify-center gap-1"
                  >
                    Import JSON
                  </button>
                </div>
              </section>

              {/* Invoice Details Form */}
              <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-orange-600" />
                  </div>
                  <h2 className="text-lg font-semibold">Invoice Details</h2>
                </div>

                {invoiceHistory.some(inv => inv.id === invoice.id) && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-amber-800 animate-[fadeIn_0.2s_ease-out]">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                      <span>✏️ Amending Saved Invoice (ID: <span className="font-mono">{invoice.id}</span>)</span>
                    </div>
                    <div className="flex gap-2 text-[11px] font-bold">
                      <button 
                        onClick={() => {
                          const newId = `INV-${Date.now()}`;
                          setInvoice(prev => ({
                            ...prev,
                            id: newId
                          }));
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-sm transition-all cursor-pointer"
                        title="Create a copy of this invoice with a new ID"
                      >
                        Save as Copy (Duplicate)
                      </button>
                      <button 
                        onClick={() => {
                          setInvoice({
                            id: `INV-${Date.now()}`,
                            studentId: '',
                            studentName: '',
                            parentName: '',
                            email: '',
                            lessons: [{
                              id: Date.now().toString(),
                              date: new Date().toISOString().split('T')[0],
                              time: '10:00',
                              duration: '60 min',
                              type: 'Single',
                              name: 'Private Ice Skating Lesson'
                            }],
                            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                            billingCycle: '6-week',
                            notes: 'Thank you for the lesson!',
                            paymentMethod: "Commonwealth Bank Australia\nWong Wing Nam\nBSB: 063-097\nAccount: 7273 8289\nPayID: 0405272775\nCash",
                            amount: 110,
                            coachName: invoice.coachName || DEFAULT_COACH_NAME,
                            coachEmail: invoice.coachEmail || DEFAULT_COACH_EMAIL,
                            coachAbn: invoice.coachAbn || DEFAULT_COACH_ABN,
                            term: 'Term 1.1',
                            rate: 110,
                            appliedCredit: 0
                          });
                        }}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm transition-all cursor-pointer"
                      >
                        Cancel Editing
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Student Name</label>
                    <input 
                      type="text" 
                      name="studentName"
                      value={invoice.studentName}
                      onChange={handleInputChange}
                      placeholder="Enter student name"
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Total Amount ($)</label>
                    <input 
                      type="number" 
                      name="amount"
                      value={invoice.amount}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Hourly Rate ($/hr)</label>
                    <input 
                      type="number" 
                      name="rate"
                      value={invoice.rate}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Term of Year</label>
                    <select
                      name="term"
                      value={invoice.term}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 transition-all text-sm font-semibold"
                    >
                      <option value="Term 1.1">Term 1.1</option>
                      <option value="Term 1.2">Term 1.2</option>
                      <option value="Term 2.1">Term 2.1</option>
                      <option value="Term 2.2">Term 2.2</option>
                      <option value="Term 3.1">Term 3.1</option>
                      <option value="Term 3.2">Term 3.2</option>
                      <option value="Term 4.1">Term 4.1</option>
                      <option value="Term 4.2">Term 4.2</option>
                      <option value="Holiday Term">Holiday Term</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Due Date</label>
                    <input 
                      type="text" 
                      name="dueDate"
                      value={invoice.dueDate}
                      onChange={handleInputChange}
                      placeholder="e.g. 2026-05-28 or Upon Receipt"
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Billing Cycle</label>
                    <input 
                      type="text" 
                      name="billingCycle"
                      value={invoice.billingCycle}
                      onChange={handleInputChange}
                      placeholder="e.g. Weekly, Monthly"
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 transition-all"
                    />
                  </div>

                </div>

                {/* Lessons List Editor */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Lessons ({invoice.lessons.length})</h3>
                    <button 
                      onClick={addLesson}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Lesson
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {invoice.lessons.map((lesson, index) => {
                      const isCredit = lesson.type === 'Credit';
                      const calculatedPrice = parseDurationToHours(lesson.duration) * invoice.rate * (lesson.type === '6-Week Cycle' ? 6 : 1);
                      return (
                        <div key={lesson.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative group">
                          <div className={`grid grid-cols-1 ${isCredit ? 'md:grid-cols-4' : 'md:grid-cols-5'} gap-3`}>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Type</label>
                              <select 
                                value={lesson.type || 'Single'}
                                onChange={(e) => updateLesson(lesson.id, 'type', e.target.value)}
                                className="w-full px-2 py-1 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-semibold"
                              >
                                <option value="Single">Single Lesson</option>
                                <option value="6-Week Cycle">6-Week Cycle</option>
                                <option value="Credit">Credit/Deduction</option>
                              </select>
                            </div>
                            {isCredit ? (
                              <>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Credit Date</label>
                                  <input 
                                    type="date" 
                                    value={lesson.date}
                                    onChange={(e) => updateLesson(lesson.id, 'date', e.target.value)}
                                    className="w-full px-2 py-1 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Credit Amount ($)</label>
                                  <input 
                                    type="number" 
                                    value={lesson.creditAmount || 0}
                                    onChange={(e) => updateLesson(lesson.id, 'creditAmount', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-semibold"
                                  />
                                </div>
                                <div></div> {/* Spacer */}
                              </>
                            ) : (
                              <>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{lesson.type === '6-Week Cycle' ? 'Start Date' : 'Date'}</label>
                                  <input 
                                    type="date" 
                                    value={lesson.date}
                                    onChange={(e) => updateLesson(lesson.id, 'date', e.target.value)}
                                    className="w-full px-2 py-1 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Time</label>
                                  <input 
                                    type="time" 
                                    value={lesson.time}
                                    onChange={(e) => updateLesson(lesson.id, 'time', e.target.value)}
                                    className="w-full px-2 py-1 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Duration</label>
                                  <select
                                    value={lesson.duration}
                                    onChange={(e) => updateLesson(lesson.id, 'duration', e.target.value)}
                                    className="w-full px-2 py-1 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-semibold"
                                  >
                                    <option value="15 min">15 min</option>
                                    <option value="30 min">30 min</option>
                                    <option value="45 min">45 min</option>
                                    <option value="60 min">60 min (1 hr)</option>
                                    <option value="90 min">90 min (1.5 hr)</option>
                                    <option value="120 min">120 min (2 hr)</option>
                                  </select>
                                </div>
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Price ($)</label>
                                    {lesson.customPrice !== undefined ? (
                                      <button 
                                        type="button"
                                        onClick={() => updateLesson(lesson.id, 'customPrice', undefined)}
                                        className="text-[9px] font-extrabold text-blue-500 hover:text-blue-700 bg-blue-50 px-1 py-0.5 rounded transition-all"
                                        title="Reset to automatically calculated price"
                                      >
                                        Auto
                                      </button>
                                    ) : (
                                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded">
                                        Auto
                                      </span>
                                    )}
                                  </div>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    value={lesson.customPrice !== undefined ? lesson.customPrice : ''}
                                    placeholder={calculatedPrice.toFixed(2)}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '') {
                                        updateLesson(lesson.id, 'customPrice', undefined);
                                      } else {
                                        updateLesson(lesson.id, 'customPrice', parseFloat(val) || 0);
                                      }
                                    }}
                                    className={`w-full px-2 py-1 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-semibold transition-all duration-200 border ${
                                      lesson.customPrice !== undefined 
                                        ? 'text-blue-600 border-blue-300 bg-blue-50/50 placeholder-blue-300 focus:bg-white' 
                                        : 'text-slate-700 border-transparent bg-white placeholder-slate-400'
                                    }`}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                          
                          <div className="mt-3">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                              {isCredit ? 'Credit Description / Reason' : 'Lesson Name on Invoice'}
                            </label>
                            <input 
                              type="text"
                              value={lesson.name || ''}
                              onChange={(e) => updateLesson(lesson.id, 'name', e.target.value)}
                              placeholder={isCredit ? 'e.g. Sickness Credit, Make-up Credit' : lesson.type === '6-Week Cycle' ? '6-week Private Lesson Package' : 'Private Ice Skating Lesson'}
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-medium"
                            />
                          </div>

                        {lesson.type === '6-Week Cycle' && lesson.cycleDates && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Cycle Weekly Dates (Auto-Generated)</label>
                            <div className="grid grid-cols-3 gap-2">
                              {lesson.cycleDates.map((cDate, dIndex) => (
                                <input
                                  key={dIndex}
                                  type="date"
                                  value={cDate}
                                  onChange={(e) => {
                                    const newDates = [...(lesson.cycleDates || [])];
                                    newDates[dIndex] = e.target.value;
                                    updateLesson(lesson.id, 'cycleDates', newDates);
                                  }}
                                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:ring-2 focus:ring-blue-500"
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="absolute right-2 -top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!isCredit && (
                            <a 
                              href={getGoogleCalendarUrl(lesson, invoice.studentName, invoice.coachName)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Add to Google Calendar"
                              className="p-1.5 bg-white border border-slate-200 text-emerald-600 rounded-full shadow-sm hover:bg-slate-50 transition-colors flex items-center justify-center"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button 
                            type="button"
                            onClick={() => duplicateLesson(lesson.id)}
                            title="Duplicate Lesson Session"
                            className="p-1.5 bg-white border border-slate-200 text-blue-600 rounded-full shadow-sm hover:bg-slate-50 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {invoice.lessons.length > 1 && (
                            <button 
                              type="button"
                              onClick={() => removeLesson(lesson.id)}
                              title="Delete Lesson Session"
                              className="p-1.5 bg-white border border-slate-200 text-red-500 rounded-full shadow-sm hover:bg-slate-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )})
                  }
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Payment Method</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <textarea 
                      name="paymentMethod"
                      value={invoice.paymentMethod}
                      onChange={handleInputChange}
                      rows={4}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 transition-all resize-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Notes</label>
                  <div className="relative">
                    <StickyNote className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <textarea 
                      name="notes"
                      value={invoice.notes}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 transition-all resize-none"
                    />
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={downloadPDF}
                  disabled={isGenerating || isGeneratingImg || !invoice.studentName}
                  className={`py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-xl ${
                    isGenerating || isGeneratingImg || !invoice.studentName
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-blue-200'
                  }`}
                >
                  {isGenerating ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Download className="w-6 h-6" />
                  )}
                  PDF
                </button>
                <button 
                  onClick={downloadImage}
                  disabled={isGenerating || isGeneratingImg || !invoice.studentName}
                  className={`py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-xl ${
                    isGenerating || isGeneratingImg || !invoice.studentName
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-[0.98] shadow-blue-100'
                  }`}
                >
                  {isGeneratingImg ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <FileText className="w-6 h-6" />
                  )}
                  Image
                </button>
              </div>
            </div>

            {/* Right Column: Live Preview */}
            <div className="sticky top-8 self-start">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <History className="w-5 h-5 text-slate-400" />
                  Live Preview
                </h2>
                <AnimatePresence>
                  {showSuccess && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex items-center gap-1 text-green-600 text-sm font-medium"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Success!
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

          {/* The Actual Invoice Template */}
          <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200 overflow-hidden border border-slate-100">
            <div 
              ref={invoiceRef}
              className="p-10 flex flex-col"
              style={{ 
                width: '100%', 
                maxWidth: '800px', 
                margin: '0 auto', 
                backgroundColor: '#ffffff',
                minHeight: '700px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-12" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 className="text-4xl font-black mb-1" style={{ color: '#2563eb', margin: 0 }}>INVOICE</h3>
                  <p className="font-mono text-sm tracking-widest" style={{ color: '#94a3b8', margin: 0 }}>{invoice.id}</p>
                </div>
                <div className="text-right" style={{ textAlign: 'right' }}>
                  <h4 className="font-bold text-xl" style={{ color: '#1e293b', margin: 0 }}>{invoice.coachName}</h4>
                  <p className="text-sm" style={{ color: '#64748b', margin: 0 }}>{invoice.coachEmail}</p>
                  {invoice.coachAbn && (
                    <p className="text-xs mt-0.5" style={{ color: '#64748b', margin: 0, whiteSpace: 'nowrap' }}>ABN: {invoice.coachAbn}</p>
                  )}
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-12 mb-12" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8', margin: 0 }}>Bill To</p>
                  <h5 className="text-2xl font-bold" style={{ color: '#1e293b', margin: 0 }}>
                    {invoice.studentName || 'Student Name'}
                  </h5>
                  {invoice.parentName && (
                    <p className="text-sm font-medium" style={{ color: '#64748b', margin: 0 }}>
                      Attn: {invoice.parentName}
                    </p>
                  )}
                  <p className="mt-1 text-sm" style={{ color: '#64748b', margin: 0 }}>
                    {invoice.email}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4" style={{ display: 'grid', gridTemplateColumns: 'auto auto auto', gap: '1.5rem', justifyContent: 'end', textAlign: 'right' }}>
                  <div style={{ whiteSpace: 'nowrap' }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8', margin: 0 }}>Term</p>
                    <p className="font-semibold text-sm" style={{ color: '#334155', margin: 0 }}>{invoice.term}</p>
                  </div>
                  <div style={{ whiteSpace: 'nowrap' }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8', margin: 0 }}>Cycle</p>
                    <p className="font-semibold text-sm" style={{ color: '#334155', margin: 0 }}>{invoice.billingCycle}</p>
                  </div>
                  <div style={{ whiteSpace: 'nowrap' }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#ef4444', margin: 0 }}>Due Date</p>
                    <p className="font-bold text-sm" style={{ color: '#ef4444', margin: 0 }}>{invoice.dueDate}</p>
                  </div>
                </div>
              </div>

              {/* Table Header */}
              <div className="pb-4 mb-4" style={{ borderBottom: '2px solid #f1f5f9', display: 'grid', gridTemplateColumns: '6.5fr 1.5fr 2fr 2fr', gap: '1rem' }}>
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Lesson Description</div>
                <div className="text-xs font-bold uppercase tracking-wider text-right" style={{ color: '#94a3b8', textAlign: 'right' }}>Time</div>
                <div className="text-xs font-bold uppercase tracking-wider text-right" style={{ color: '#94a3b8', textAlign: 'right' }}>Duration</div>
                <div className="text-xs font-bold uppercase tracking-wider text-right" style={{ color: '#94a3b8', textAlign: 'right' }}>Amount</div>
              </div>

              {/* Table Rows */}
              <div className="space-y-4">
                {invoice.lessons.map((lesson) => {
                  const isCredit = lesson.type === 'Credit';
                  const isCycle = lesson.type === '6-Week Cycle';
                  const hours = parseDurationToHours(lesson.duration);
                  const multiplier = isCycle ? 6 : 1;
                  const lessonAmount = isCredit 
                    ? -(lesson.creditAmount || 0) 
                    : (lesson.customPrice !== undefined ? lesson.customPrice : (hours * invoice.rate * multiplier));

                  return (
                    <div key={lesson.id} className="py-3" style={{ borderBottom: '1px solid #f8fafc', display: 'grid', gridTemplateColumns: '6.5fr 1.5fr 2fr 2fr', gap: '1rem', alignItems: 'center' }}>
                      <div>
                        <h6 className="font-bold" style={{ color: '#1e293b', margin: 0, fontSize: '0.95rem' }}>
                          {lesson.name || (isCredit ? 'Credit Deduction' : isCycle ? '6-week Private Lesson Package' : 'Private Ice Skating Lesson')}
                        </h6>
                        {isCredit ? (
                          <p className="text-xs flex items-center gap-1 mt-1.5" style={{ color: '#64748b', margin: 0, display: 'flex', alignItems: 'center' }}>
                            <Calendar className="w-3.5 h-3.5 text-blue-500" />
                            <span>Date: {lesson.date}</span>
                          </p>
                        ) : !isCycle ? (
                          <p className="text-xs flex items-center gap-1 mt-1.5" style={{ color: '#64748b', margin: 0, display: 'flex', alignItems: 'center' }}>
                            <Calendar className="w-3.5 h-3.5 text-blue-500" />
                            <span>{lesson.date}</span>
                          </p>
                        ) : (
                          <div style={{ marginTop: '0.5rem' }}>
                            <p className="text-xs font-semibold" style={{ color: '#334155', margin: 0 }}>
                              6 sessions starting {lesson.date}:
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.4rem', borderLeft: '2px solid #3b82f6', paddingLeft: '0.5rem' }}>
                              {lesson.cycleDates?.map((cDate, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#475569' }}>
                                  <Calendar className="w-3 h-3 text-blue-500" style={{ flexShrink: 0 }} />
                                  <span>Week {idx + 1}: {cDate}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="text-right font-medium text-sm" style={{ color: '#475569', textAlign: 'right' }}>
                        {isCredit ? '-' : lesson.time}
                      </div>
                      <div className="text-right font-semibold text-sm" style={{ color: '#334155', textAlign: 'right' }}>
                        {isCredit ? '-' : lesson.duration} {isCycle && <span style={{ color: '#3b82f6', fontSize: '0.8rem' }}>× 6</span>}
                      </div>
                      <div className="text-right font-bold text-sm" style={{ color: '#1e293b', textAlign: 'right' }}>
                        {isCredit ? `-$${Number(lesson.creditAmount || 0).toFixed(2)}` : `$${Number(lessonAmount).toFixed(2)}`}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Spacer */}
              <div style={{ flexGrow: 1 }}></div>

              {/* Footer Section */}
              <div className="mt-12 pt-8" style={{ borderTop: '2px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'stretch' }}>
                <div style={{ width: '56%', flexShrink: 0, flexGrow: 0 }}>
                  <div className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8', margin: 0 }}>Payment Instructions</p>
                    <div className="p-4 rounded-2xl" style={{ backgroundColor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                      <p className="text-sm font-semibold" style={{ color: '#334155', margin: 0, whiteSpace: 'pre-line' }}>{invoice.paymentMethod}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8', margin: 0 }}>Notes</p>
                    <p className="text-sm italic leading-relaxed" style={{ color: '#64748b', margin: 0 }}>
                      "{invoice.notes}"
                    </p>
                  </div>
                </div>
                <div style={{ width: '40%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', flexShrink: 0, flexGrow: 0 }}>
                  <div className="rounded-3xl p-6 text-center" style={{ 
                    backgroundColor: '#2563eb', 
                    color: '#ffffff', 
                    textAlign: 'center',
                    minHeight: '160px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'stretch'
                  }}>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#bfdbfe', margin: 0 }}>Total Amount Due</p>
                    </div>
                    <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0.5rem 0' }}>
                      <h2 className="text-4xl font-black" style={{ margin: 0, lineHeight: 1 }}>${Number(invoice.amount).toFixed(2)}</h2>
                    </div>
                    <div>
                      <p className="text-xs font-medium" style={{ color: '#bfdbfe', margin: 0 }}>
                        (Includes 10% GST of ${(Number(invoice.amount) / 11).toFixed(2)})
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-12 text-center" style={{ textAlign: 'center' }}>
                <p className="text-xs uppercase tracking-[0.2em]" style={{ color: '#cbd5e1', margin: 0 }}>Thank you for choosing CoachLedger</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      ` }} />
    </div>
  </div>
);
}
