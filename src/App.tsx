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
  History
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface Student {
  id: string;
  name: string;
  parentName: string;
  email: string;
  phone: string;
  rate: number;
}

interface Lesson {
  id: string;
  type: string;
  dates: string[];
  time: string;
  duration: string;
  price: number | null;
}

interface InvoiceData {
  id: string;
  studentId: string;
  studentName: string;
  parentName: string;
  email: string;
  lessons: Lesson[];
  nextBillingDate: string;
  dueDate: string;
  billingCycle: string;
  notes: string;
  paymentMethod: string;
  amount: number;
  coachName: string;
  coachEmail: string;
}

const DEFAULT_COACH_NAME = "Skating Coach";
const DEFAULT_COACH_EMAIL = "coach@example.com";

type View = 'invoice' | 'students';

export default function App() {
  const [view, setView] = useState<View>('invoice');
  const [students, setStudents] = useState<Student[]>([]);
  const [newStudent, setNewStudent] = useState<Partial<Student>>({
    name: '',
    parentName: '',
    email: '',
    phone: '',
    rate: 50
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
      type: 'Private Ice Skating Lesson',
      dates: [new Date().toISOString().split('T')[0]],
      time: '10:00',
      duration: '60 min',
      price: null
    }],
    nextBillingDate: '',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    billingCycle: 'Weekly',
    notes: 'Thank you for the lesson!',
    paymentMethod: 'Venmo / Zelle',
    amount: 50,
    coachName: DEFAULT_COACH_NAME,
    coachEmail: DEFAULT_COACH_EMAIL,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load students from localStorage
  useEffect(() => {
    const savedStudents = localStorage.getItem('skating_students_v2');
    if (savedStudents) {
      setStudents(JSON.parse(savedStudents));
    } else {
      // Migrate from old format if exists
      const oldStudents = localStorage.getItem('skating_students');
      if (oldStudents) {
        const parsed = JSON.parse(oldStudents);
        const migrated = parsed.map((s: any) => ({
          id: s.id,
          name: s.name,
          parentName: '',
          email: '',
          phone: '',
          rate: 50
        }));
        setStudents(migrated);
      }
    }
    
    const savedCoach = localStorage.getItem('skating_coach_info');
    if (savedCoach) {
      const { name, email } = JSON.parse(savedCoach);
      setInvoice(prev => ({ ...prev, coachName: name, coachEmail: email }));
    }
  }, []);

  // Save students to localStorage
  useEffect(() => {
    localStorage.setItem('skating_students_v2', JSON.stringify(students));
  }, [students]);

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
        rate: newStudent.rate || 50,
      };
      setStudents([...students, student]);
    }
    
    setNewStudent({
      name: '',
      parentName: '',
      email: '',
      phone: '',
      rate: 50
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
        
        const [name, parentName, email, phone, rate] = line.split(',').map(s => s.trim());
        if (name) {
          newStudents.push({
            id: (Date.now() + i).toString(),
            name,
            parentName: parentName || '',
            email: email || '',
            phone: phone || '',
            rate: parseFloat(rate) || 50
          });
        }
      }
      
      setStudents(prev => [...prev, ...newStudents]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const selectStudentForInvoice = (student: Student) => {
    setInvoice(prev => ({ 
      ...prev, 
      studentId: student.id,
      studentName: student.name,
      parentName: student.parentName,
      email: student.email,
      amount: prev.lessons.reduce((sum, l) => sum + (l.price !== null ? l.price : student.rate * l.dates.length), 0)
    }));
    setView('invoice');
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setInvoice(prev => ({ 
      ...prev, 
      [name]: name === 'amount' ? parseFloat(value) || 0 : value 
    }));
  };

  const addLesson = () => {
    const newLesson: Lesson = {
      id: Date.now().toString(),
      type: 'Private Ice Skating Lesson',
      dates: [new Date().toISOString().split('T')[0]],
      time: '10:00',
      duration: '60 min',
      price: null
    };
    
    setInvoice(prev => {
      const student = students.find(s => s.id === prev.studentId);
      const rate = student ? student.rate : 50;
      const newLessons = [...prev.lessons, newLesson];
      return {
        ...prev,
        lessons: newLessons,
        amount: newLessons.reduce((sum, l) => sum + (l.price !== null ? l.price : rate * l.dates.length), 0)
      };
    });
  };

  const addPackage = () => {
    const dates = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i * 7);
      return d.toISOString().split('T')[0];
    });

    const newPackage: Lesson = {
      id: Date.now().toString(),
      type: '6-Week Private Lesson Package',
      dates: dates,
      time: '10:00',
      duration: '60 min',
      price: null
    };

    setInvoice(prev => {
      const student = students.find(s => s.id === prev.studentId);
      const rate = student ? student.rate : 50;
      const newLessons = [...prev.lessons, newPackage];
      const nextBilling = new Date(dates[5]);
      nextBilling.setDate(nextBilling.getDate() + 7);

      return {
        ...prev,
        lessons: newLessons,
        nextBillingDate: nextBilling.toISOString().split('T')[0],
        amount: newLessons.reduce((sum, l) => sum + (l.price !== null ? l.price : rate * l.dates.length), 0)
      };
    });
  };

  const removeLesson = (id: string) => {
    if (invoice.lessons.length <= 1) return;
    setInvoice(prev => {
      const student = students.find(s => s.id === prev.studentId);
      const rate = student ? student.rate : 50;
      const newLessons = prev.lessons.filter(l => l.id !== id);
      return {
        ...prev,
        lessons: newLessons,
        amount: newLessons.reduce((sum, l) => sum + (l.price !== null ? l.price : rate * l.dates.length), 0)
      };
    });
  };

  const updateLesson = (id: string, field: keyof Lesson, value: any) => {
    setInvoice(prev => {
      const newLessons = prev.lessons.map(l => l.id === id ? { ...l, [field]: value } : l);
      const student = students.find(s => s.id === prev.studentId);
      const rate = student ? student.rate : 50;
      return {
        ...prev,
        lessons: newLessons,
        amount: newLessons.reduce((sum, l) => sum + (l.price !== null ? l.price : rate * l.dates.length), 0)
      };
    });
  };

  const updateLessonDate = (id: string, dateIndex: number, value: string) => {
    setInvoice(prev => {
      const newLessons = prev.lessons.map(l => {
        if (l.id === id) {
          const newDates = [...l.dates];
          newDates[dateIndex] = value;
          
          if (dateIndex === 0 && l.dates.length === 6) {
            const baseDate = new Date(value);
            for (let i = 1; i < 6; i++) {
              const d = new Date(baseDate);
              d.setDate(d.getDate() + i * 7);
              newDates[i] = d.toISOString().split('T')[0];
            }
          }
          return { ...l, dates: newDates };
        }
        return l;
      });
      
      let newNextBillingDate = prev.nextBillingDate;
      const updatedLesson = newLessons.find(l => l.id === id);
      if (updatedLesson && updatedLesson.dates.length === 6 && dateIndex === 0) {
        const lastDate = new Date(updatedLesson.dates[5]);
        lastDate.setDate(lastDate.getDate() + 7);
        newNextBillingDate = lastDate.toISOString().split('T')[0];
      }

      return {
        ...prev,
        lessons: newLessons,
        nextBillingDate: newNextBillingDate
      };
    });
  };

  const saveCoachInfo = () => {
    localStorage.setItem('skating_coach_info', JSON.stringify({
      name: invoice.coachName,
      email: invoice.coachEmail
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
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please see console for details.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">GlideInvoice</h1>
            <p className="text-slate-500">Fast invoicing for skating coaches</p>
          </div>
          <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
            <button 
              onClick={() => setView('invoice')}
              className={`px-6 py-2 rounded-xl font-medium transition-all ${view === 'invoice' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Invoice
            </button>
            <button 
              onClick={() => setView('students')}
              className={`px-6 py-2 rounded-xl font-medium transition-all ${view === 'students' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Students
            </button>
          </div>
        </header>

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
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Hourly Rate ($)</label>
                    <input 
                      type="number" 
                      value={newStudent.rate}
                      onChange={(e) => setNewStudent(prev => ({ ...prev, rate: parseFloat(e.target.value) }))}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all"
                    />
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
                        setNewStudent({ name: '', parentName: '', email: '', phone: '', rate: 50 });
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>
                <button 
                  onClick={saveCoachInfo}
                  className="mt-4 flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save Profile Defaults
                </button>
              </section>

              {/* Student Quick Select */}
              <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                      <User className="w-4 h-4 text-purple-600" />
                    </div>
                    <h2 className="text-lg font-semibold">Quick Select Student</h2>
                  </div>
                  <button 
                    onClick={() => setView('students')}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Manage All
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                  {students.map(student => (
                    <div 
                      key={student.id}
                      className={`group flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                        invoice.studentId === student.id 
                        ? 'bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-100' 
                        : 'bg-white border-slate-200 text-slate-600 hover:border-purple-300'
                      }`}
                      onClick={() => selectStudentForInvoice(student)}
                    >
                      <span className="text-sm font-medium">{student.name}</span>
                    </div>
                  ))}
                  {students.length === 0 && (
                    <p className="text-sm text-slate-400 italic">No students saved yet. Go to Students tab to add some.</p>
                  )}
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
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Due Date</label>
                    <input 
                      type="date" 
                      name="dueDate"
                      value={invoice.dueDate}
                      onChange={handleInputChange}
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
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Next Billing Date</label>
                    <input 
                      type="date" 
                      name="nextBillingDate"
                      value={invoice.nextBillingDate}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 transition-all"
                    />
                  </div>
                </div>

                {/* Lessons List Editor */}
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Line Items ({invoice.lessons.length})</h3>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={addLesson}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg"
                      >
                        <Plus className="w-3 h-3" /> Custom Item
                      </button>
                      <button 
                        onClick={addPackage}
                        className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 bg-purple-50 px-2 py-1 rounded-lg"
                      >
                        <Plus className="w-3 h-3" /> 6-Week Package
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {invoice.lessons.map((lesson, index) => (
                      <div key={lesson.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative group">
                        <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                           <div>
                             <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Description / Subj</label>
                             <input 
                               type="text" 
                               value={lesson.type}
                               onChange={(e) => updateLesson(lesson.id, 'type', e.target.value)}
                               className="w-full px-2 py-1 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                             />
                           </div>
                           <div>
                             <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Custom Price ($) - Leave empty for default</label>
                             <input 
                               type="number" 
                               value={lesson.price === null ? '' : lesson.price}
                               onChange={(e) => updateLesson(lesson.id, 'price', e.target.value === '' ? null : parseFloat(e.target.value))}
                               className="w-full px-2 py-1 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                             />
                           </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 mb-3">
                          {lesson.dates.map((date, dateIdx) => (
                            <div key={dateIdx} className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-400 w-16 text-right">
                                {lesson.dates.length > 1 ? `Week ${dateIdx + 1}` : 'Date'}
                              </span>
                              <input 
                                type="date" 
                                value={date}
                                onChange={(e) => updateLessonDate(lesson.id, dateIdx, e.target.value)}
                                className="flex-1 px-2 py-1 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                            <input 
                              type="text" 
                              value={lesson.duration}
                              onChange={(e) => updateLesson(lesson.id, 'duration', e.target.value)}
                              placeholder="e.g. 60 min"
                              className="w-full px-2 py-1 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        {invoice.lessons.length > 1 && (
                          <button 
                            onClick={() => removeLesson(lesson.id)}
                            className="absolute -right-2 -top-2 p-1 bg-white border border-slate-200 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Payment Method</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      name="paymentMethod"
                      value={invoice.paymentMethod}
                      onChange={handleInputChange}
                      placeholder="e.g. Venmo: @coach-skate"
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500 transition-all"
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
                <div className="grid grid-cols-3 gap-4" style={{ display: 'grid', gridTemplateColumns: invoice.nextBillingDate ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8', margin: 0 }}>Cycle</p>
                    <p className="font-semibold" style={{ color: '#334155', margin: 0 }}>{invoice.billingCycle}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8', margin: 0 }}>Due Date</p>
                    <p className="font-semibold" style={{ color: '#334155', margin: 0 }}>{invoice.dueDate}</p>
                  </div>
                  {invoice.nextBillingDate && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8', margin: 0 }}>Next Billing</p>
                      <p className="font-semibold" style={{ color: '#334155', margin: 0 }}>{invoice.nextBillingDate}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Table Header */}
              <div className="pb-4 mb-4 grid grid-cols-12 gap-4" style={{ borderBottom: '2px solid #f1f5f9', display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1rem' }}>
                <div className="col-span-5 text-xs font-bold uppercase tracking-wider" style={{ color: '#94a3b8', gridColumn: 'span 5 / span 5' }}>Item Description</div>
                <div className="col-span-2 text-xs font-bold uppercase tracking-wider text-center" style={{ color: '#94a3b8', gridColumn: 'span 2 / span 2', textAlign: 'center' }}>Time</div>
                <div className="col-span-2 text-xs font-bold uppercase tracking-wider text-center" style={{ color: '#94a3b8', gridColumn: 'span 2 / span 2', textAlign: 'center' }}>Duration</div>
                <div className="col-span-3 text-xs font-bold uppercase tracking-wider text-right" style={{ color: '#94a3b8', gridColumn: 'span 3 / span 3', textAlign: 'right' }}>Amount</div>
              </div>

              {/* Table Rows */}
              <div className="space-y-4">
                {invoice.lessons.map((lesson) => {
                  const student = students.find(s => s.id === invoice.studentId);
                  const rate = student ? student.rate : 50;
                  const itemPrice = lesson.price !== null ? lesson.price : rate * lesson.dates.length;
                  return (
                  <div key={lesson.id} className="grid grid-cols-12 gap-4 py-3 items-start" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1rem', alignItems: 'flex-start', borderBottom: '1px solid #f8fafc' }}>
                    <div className="col-span-5" style={{ gridColumn: 'span 5 / span 5' }}>
                      <h6 className="font-bold text-sm" style={{ color: '#1e293b', margin: 0 }}>{lesson.type}</h6>
                      {lesson.dates.length > 1 ? (
                        <div className="mt-2 space-y-1">
                          {lesson.dates.map((d, i) => (
                             <p key={i} className="text-xs flex items-center gap-1" style={{ color: '#64748b', margin: 0, display: 'flex', alignItems: 'center' }}>
                               <span className="w-12 font-medium" style={{ display: 'inline-block', width: '3rem' }}>Week {i+1}:</span> <Calendar className="w-3 h-3" style={{ color: '#64748b', marginLeft: '4px', marginRight: '4px' }} /> {d}
                             </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm flex items-center gap-1 mt-1" style={{ color: '#64748b', margin: 0, display: 'flex', alignItems: 'center' }}>
                          <Calendar className="w-3 h-3" style={{ color: '#64748b' }} /> {lesson.dates[0]}
                        </p>
                      )}
                    </div>
                    <div className="col-span-2 text-center font-medium mt-1" style={{ color: '#475569', gridColumn: 'span 2 / span 2', textAlign: 'center' }}>{lesson.time}</div>
                    <div className="col-span-2 text-center font-bold mt-1" style={{ color: '#1e293b', gridColumn: 'span 2 / span 2', textAlign: 'center' }}>{lesson.duration}</div>
                    <div className="col-span-3 text-right font-bold mt-1" style={{ color: '#2563eb', gridColumn: 'span 3 / span 3', textAlign: 'right' }}>${itemPrice.toFixed(2)}</div>
                  </div>
                )})}
              </div>

              {/* Spacer */}
              <div style={{ flexGrow: 1 }}></div>

              {/* Footer Section */}
              <div className="mt-12 pt-8 grid grid-cols-12 gap-8" style={{ borderTop: '2px solid #f8fafc', display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '2rem' }}>
                <div className="col-span-7" style={{ gridColumn: 'span 7 / span 7' }}>
                  <div className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8', margin: 0 }}>Payment Instructions</p>
                    <div className="p-4 rounded-2xl" style={{ backgroundColor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                      <p className="text-sm font-semibold" style={{ color: '#334155', margin: 0 }}>{invoice.paymentMethod}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8', margin: 0 }}>Notes</p>
                    <p className="text-sm italic leading-relaxed" style={{ color: '#64748b', margin: 0 }}>
                      "{invoice.notes}"
                    </p>
                  </div>
                </div>
                <div className="col-span-5" style={{ gridColumn: 'span 5 / span 5' }}>
                  <div className="rounded-3xl p-6 text-right" style={{ backgroundColor: '#2563eb', color: '#ffffff', textAlign: 'right' }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#bfdbfe', margin: 0 }}>Total Amount Due</p>
                    <h2 className="text-4xl font-black" style={{ margin: 0 }}>${Number(invoice.amount).toFixed(2)}</h2>
                  </div>
                </div>
              </div>
              
              <div className="mt-12 text-center" style={{ textAlign: 'center' }}>
                <p className="text-xs uppercase tracking-[0.2em]" style={{ color: '#cbd5e1', margin: 0 }}>Thank you for choosing GlideInvoice</p>
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
