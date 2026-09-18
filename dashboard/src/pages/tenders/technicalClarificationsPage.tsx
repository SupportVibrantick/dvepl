import React, { useEffect, useState, useMemo } from 'react';
import { 
  MessageSquare, 
  Paperclip, 
  Calendar, 
  User, 
  Clock, 
  Plus, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  ShieldAlert, 
  History, 
  Download, 
  ExternalLink,
  FileText,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'react-hot-toast';
import { tenderApi, securityApi } from '@/services/modules';
import { useERPStore } from '@/store/erpStore';
import { canPerformPageAction } from '@/utils/pagePermissions';

const ITEMS_PER_PAGE = 5;

export function TechnicalClarificationsPage() {
  const store = useERPStore();
  const currentUser = store.users?.find((u: any) => u.id === store.currentUserId) as any;
  const canCreate = canPerformPageAction(currentUser?.actionPermissions, "technical_clarifications", "create");
  const canEdit = canPerformPageAction(currentUser?.actionPermissions, "technical_clarifications", "edit");
  const [threads, setThreads] = useState<any[]>([]);
  const [tenders, setTenders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedThread, setSelectedThread] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === "undefined") return 5;
    try {
      const saved = window.localStorage.getItem("dvepl-page-size:technicalclarifications");
      return saved ? parseInt(saved, 10) : 5;
    } catch {
      return 5;
    }
  });
  const [customPageSize, setCustomPageSize] = useState<string>(String(pageSize));

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("dvepl-page-size:technicalclarifications", String(pageSize));
      } catch {
        // fail silently
      }
    }
  }, [pageSize]);

  const getVisiblePages = (currPage: number, totalPgs: number) => {
    const delta = 1;
    const range: number[] = [];
    const rangeWithDots: (number | string)[] = [];
    let l: number | null = null;

    for (let i = 1; i <= totalPgs; i++) {
      if (i === 1 || i === totalPgs || (i >= currPage - delta && i <= currPage + delta)) {
        range.push(i);
      }
    }

    for (const i of range) {
      if (l !== null) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l > 2) {
          rangeWithDots.push("...");
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  };

  // New Thread States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [tenderId, setTenderId] = useState('');
  const [question, setQuestion] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Thread States
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAssignedToId, setEditAssignedToId] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState('MEDIUM');
  const [editStatus, setEditStatus] = useState('OPEN');
  
  // Reply & Attachment States
  const [replyText, setReplyText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isReplySubmitting, setIsReplySubmitting] = useState(false);

  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [isAttachSubmitting, setIsAttachSubmitting] = useState(false);

  const [showTimeline, setShowTimeline] = useState(false);

  const selectedTenderLabel = useMemo(() => {
    if (!tenderId) return undefined;
    const selected = tenders.find(t => t.id === tenderId);
    return selected ? `${selected.title} (${selected.id.slice(0, 8)}...)` : undefined;
  }, [tenderId, tenders]);

  const selectedAssigneeLabel = useMemo(() => {
    if (!assignedToId) return undefined;
    const selected = users.find(u => u.id === assignedToId);
    return selected ? selected.name : undefined;
  }, [assignedToId, users]);

  const selectedPriorityLabel = useMemo(() => {
    if (!priority) return undefined;
    const labels: Record<string, string> = {
      LOW: 'Low',
      MEDIUM: 'Medium',
      HIGH: 'High',
      CRITICAL: 'Critical'
    };
    return labels[priority] || priority;
  }, [priority]);

  const selectedEditAssigneeLabel = useMemo(() => {
    if (!editAssignedToId) return undefined;
    const selected = users.find(u => u.id === editAssignedToId);
    return selected ? selected.name : undefined;
  }, [editAssignedToId, users]);

  const selectedEditStatusLabel = useMemo(() => {
    if (!editStatus) return undefined;
    const labels: Record<string, string> = {
      OPEN: 'Open',
      ANSWERED: 'Answered',
      REVISED: 'Revised',
      CLOSED: 'Closed'
    };
    return labels[editStatus] || editStatus;
  }, [editStatus]);

  const selectedEditPriorityLabel = useMemo(() => {
    if (!editPriority) return undefined;
    const labels: Record<string, string> = {
      LOW: 'Low',
      MEDIUM: 'Medium',
      HIGH: 'High',
      CRITICAL: 'Critical'
    };
    return labels[editPriority] || editPriority;
  }, [editPriority]);

  const fetchThreads = async () => {
    setIsLoading(true);
    try {
      const data = await tenderApi.technicalClarifications.list();
      setThreads(data);
    } catch (error: any) {
      toast.error('Failed to load clarification list.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [tendersData, usersData] = await Promise.all([
        Promise.resolve([]),
        securityApi.users.list()
      ]);
      setTenders(tendersData);
      setUsers(usersData);
    } catch (error: any) {
      console.warn('Failed to load metadata options:', error);
    }
  };

  const fetchThreadDetail = async (id: string) => {
    setIsDetailLoading(true);
    try {
      const data = await (tenderApi.technicalClarifications as any).read(id);
      setSelectedThread(data);
    } catch (error: any) {
      toast.error('Failed to load conversation thread details.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchThreads();
    fetchMetadata();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, pageSize]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenderId || !question) {
      toast.error('Tender and Question are required fields.');
      return;
    }
    // Get currently logged-in user id or default to first user for demo/fallback
    const raisedById = users[0]?.id || '';
    if (!raisedById) {
      toast.error('No raisedBy user detected in system.');
      return;
    }

    setIsSubmitting(true);
    try {
      await tenderApi.technicalClarifications.create({
        tenderId,
        question,
        raisedById,
        assignedToId: assignedToId || null,
        dueDate: dueDate || null,
        priority,
      });
      toast.success('Technical clarification thread created successfully.');
      setIsCreateOpen(false);
      setTenderId('');
      setQuestion('');
      setAssignedToId('');
      setDueDate('');
      setPriority('MEDIUM');
      fetchThreads();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create clarification.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread) return;
    setIsSubmitting(true);
    try {
      if (tenderApi.technicalClarifications.update) {
        await tenderApi.technicalClarifications.update(selectedThread.id, {
          question: editQuestion || undefined,
          assignedToId: editAssignedToId || null,
          dueDate: editDueDate || null,
          priority: editPriority,
          status: editStatus,
        });
      }
      toast.success('Clarification thread updated.');
      setIsEditOpen(false);
      fetchThreadDetail(selectedThread.id);
      fetchThreads();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update clarification.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !replyText.trim()) return;
    setIsReplySubmitting(true);
    try {
      await (tenderApi.technicalClarifications as any).reply(selectedThread.id, {
        reply: replyText,
        isInternal,
      });
      toast.success('Reply posted.');
      setReplyText('');
      setIsInternal(false);
      fetchThreadDetail(selectedThread.id);
      fetchThreads();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to post reply.');
    } finally {
      setIsReplySubmitting(false);
    }
  };

  const handleAttachSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !fileName || !fileUrl) return;
    setIsAttachSubmitting(true);
    try {
      await (tenderApi.technicalClarifications as any).addAttachment(selectedThread.id, {
        fileName,
        fileUrl,
      });
      toast.success('Attachment added successfully.');
      setIsAttachOpen(false);
      setFileName('');
      setFileUrl('');
      fetchThreadDetail(selectedThread.id);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to add attachment.');
    } finally {
      setIsAttachSubmitting(false);
    }
  };

  const openEditDialog = () => {
    if (!selectedThread) return;
    setEditQuestion(selectedThread.question || '');
    setEditAssignedToId(selectedThread.assignedToId || '');
    setEditDueDate(selectedThread.dueDate ? new Date(selectedThread.dueDate).toISOString().split('T')[0] : '');
    setEditPriority(selectedThread.priority || 'MEDIUM');
    setEditStatus(selectedThread.status || 'OPEN');
    setIsEditOpen(true);
  };

  const filteredThreads = threads.filter(t => {
    const questionMatch = t.question?.toLowerCase().includes(search.toLowerCase());
    const tenderMatch = t.tender?.title?.toLowerCase().includes(search.toLowerCase());
    return questionMatch || tenderMatch;
  });

  const totalPages = Math.ceil(filteredThreads.length / pageSize);
  const paginatedThreads = filteredThreads.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'CRITICAL': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'HIGH': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'MEDIUM': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'CLOSED': return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
      case 'ANSWERED': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'REVISED': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex justify-between items-center">
        <div>
          <span className="text-xs font-semibold text-muted-foreground/80">Tenders & Bid Management</span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-0.5">Technical Clarifications</h1>
        </div>
        {canCreate && (
          <Button variant="default" size="sm" onClick={() => setIsCreateOpen(true)} className="h-9 gap-1.5 text-xs font-semibold bg-primary text-white">
            <Plus className="h-4 w-4" />
            <span>New Clarification</span>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Threads List */}
        <div className="lg:col-span-5 space-y-4">
          {/* Pagination Controls */}
          {!isLoading && filteredThreads.length > 0 && (
            <div className="flex flex-col gap-2 p-1.5 bg-muted/10 border rounded-xl">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-muted/60 border border-border/70 p-1 h-11 rounded-xl shadow-xs">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border/30 hover:shadow-3xs transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4.5 w-4.5" />
                  </Button>

                  <div className="flex items-center gap-1">
                    {getVisiblePages(currentPage, totalPages).map((page, index) => {
                      if (page === "...") {
                        return (
                          <span
                            key={`dots-${index}`}
                            className="text-xs text-muted-foreground font-semibold px-1.5 select-none"
                          >
                            ...
                          </span>
                        );
                      }
                      const isCurrent = page === currentPage;
                      return (
                        <Button
                          key={`page-${page}`}
                          variant={isCurrent ? "default" : "ghost"}
                          size="sm"
                          className={`h-9 w-9 p-0 rounded-lg text-xs font-semibold transition-all duration-150 ${
                            isCurrent
                              ? "bg-primary text-white hover:bg-primary/95 shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border/30 hover:shadow-3xs"
                          }`}
                          onClick={() => setCurrentPage(page as number)}
                        >
                          {page}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border/30 hover:shadow-3xs transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4.5 w-4.5" />
                  </Button>
                </div>

                {/* Custom Entries Selector Pill */}
                <div className="flex items-center gap-2 bg-muted/60 border border-border/70 px-3 h-11 rounded-xl shadow-xs text-xs text-muted-foreground font-medium">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-12 h-7 text-center bg-card border border-border/70 text-foreground rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 font-bold text-xs"
                    value={customPageSize}
                    onChange={(e) => {
                      const valStr = e.target.value.replace(/[^0-9]/g, "");
                      setCustomPageSize(valStr);
                      if (valStr) {
                        const valNum = parseInt(valStr, 10);
                        if (valNum > 0) {
                          setPageSize(valNum);
                        }
                      }
                    }}
                    onBlur={() => {
                      if (!customPageSize || parseInt(customPageSize, 10) <= 0) {
                        setPageSize(5);
                        setCustomPageSize("5");
                      }
                    }}
                  />
                  <span className="hidden sm:inline">/ page</span>
                  <div className="w-px h-4 bg-border/80 mx-1.5" />
                  <button
                    type="button"
                    className="text-primary hover:text-primary/80 font-bold uppercase text-[10px] tracking-wider transition-colors"
                    onClick={() => {
                      setPageSize(filteredThreads.length || Number.MAX_SAFE_INTEGER);
                      setCustomPageSize(String(filteredThreads.length || Number.MAX_SAFE_INTEGER));
                    }}
                  >
                    All
                  </button>
                </div>
              </div>

              <span className="text-[10px] text-muted-foreground font-medium text-right px-2">
                Showing {filteredThreads.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredThreads.length)} of {filteredThreads.length}
              </span>
            </div>
          )}

          <div className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                type="text" 
                placeholder="Search clarifications..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 border-border text-xs rounded-lg"
              />
            </div>

            <div className="space-y-3 min-h-[350px]">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2">
                  <Loader2 className="animate-spin h-6 w-6 text-primary" />
                  <p className="text-xs text-muted-foreground">Loading clarification index...</p>
                </div>
              ) : paginatedThreads.length > 0 ? (
                paginatedThreads.map((thread) => (
                  <div 
                    key={thread.id} 
                    onClick={() => fetchThreadDetail(thread.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer hover:shadow-xs ${
                      selectedThread?.id === thread.id
                        ? 'border-primary bg-primary/5 shadow-xs'
                        : 'border-border bg-card/50 hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground truncate max-w-[150px]">
                        Tender: {thread.tender?.title || 'System'}
                      </span>
                      <div className="flex gap-1">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${getPriorityColor(thread.priority)}`}>
                          {thread.priority}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${getStatusColor(thread.status)}`}>
                          {thread.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-foreground mt-2 line-clamp-2">{thread.question}</p>
                    <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground font-medium">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {thread.raisedBy?.name || 'System'}
                      </span>
                      <span>{new Date(thread.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-20 text-xs text-muted-foreground font-medium">
                  No technical clarifications found.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Conversation Thread Details */}
        <div className="lg:col-span-7">
          {isDetailLoading ? (
            <div className="bg-card border border-border rounded-xl p-20 shadow-sm flex flex-col items-center justify-center min-h-[480px] gap-2">
              <Loader2 className="animate-spin h-8 w-8 text-primary" />
              <p className="text-xs text-muted-foreground font-medium">Loading conversation history...</p>
            </div>
          ) : selectedThread ? (
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
              {/* Thread Header */}
              <div className="p-4 border-b border-border bg-muted/10 space-y-3">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
                      Tender ID: {selectedThread.tenderId}
                    </span>
                    <h2 className="text-sm font-bold text-foreground pt-1">{selectedThread.question}</h2>
                  </div>
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={openEditDialog} className="h-8 text-xs font-semibold">
                      Edit Status
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-[10px] text-muted-foreground font-medium">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/80">Raised By</p>
                      <p className="text-foreground font-semibold">{selectedThread.raisedBy?.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/80">Assigned To</p>
                      <p className="text-foreground font-semibold">{selectedThread.assignedTo?.name || 'Unassigned'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/80">Due Date</p>
                      <p className="text-foreground font-semibold">{selectedThread.dueDate ? new Date(selectedThread.dueDate).toLocaleDateString() : 'None'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/80">Last Updated</p>
                      <p className="text-foreground font-semibold">{new Date(selectedThread.updatedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Replies & Conversations Feed */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 max-h-[350px]">
                {selectedThread.replies?.length > 0 ? (
                  selectedThread.replies.map((reply: any) => (
                    <div 
                      key={reply.id} 
                      className={`flex flex-col max-w-[85%] rounded-2xl p-3 text-xs ${
                        reply.isInternal 
                          ? 'ml-0 bg-amber-500/10 text-amber-900 border border-amber-500/20 align-self-start' 
                          : 'ml-auto bg-primary/10 text-foreground border border-primary/20 align-self-end'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 border-b border-muted/20 pb-1 mb-1.5 text-[9px] font-bold">
                        <span className="flex items-center gap-1">
                          {reply.isInternal && <ShieldAlert className="h-3 w-3 text-amber-600 mr-0.5" />}
                          {reply.repliedBy?.name} {reply.isInternal && '(Internal Note)'}
                        </span>
                        <span className="text-muted-foreground/80">
                          {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="leading-relaxed whitespace-pre-line">{reply.reply}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-xs text-muted-foreground font-medium">
                    No replies in this thread. Post a response below to start the conversation.
                  </div>
                )}
              </div>

              {/* Attachments Section */}
              <div className="p-3 bg-muted/20 border-t border-border">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Paperclip className="h-3.5 w-3.5" /> Attachments ({selectedThread.attachments?.length || 0})
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setIsAttachOpen(true)} className="h-6 text-[10px] font-semibold text-primary">
                    + Attach File
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedThread.attachments?.map((file: any) => (
                    <a 
                      key={file.id} 
                      href={file.fileUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-card border hover:bg-muted/80 transition px-2.5 py-1 text-[10px] font-semibold text-foreground/90"
                    >
                      <FileText className="h-3 w-3 text-primary" />
                      <span>{file.fileName}</span>
                      <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </div>

              {/* Input Reply Panel */}
              <form onSubmit={handleReplySubmit} className="p-4 border-t border-border bg-card space-y-3">
                <textarea 
                  placeholder="Type your response here..." 
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full min-h-[60px] p-2.5 text-xs bg-card border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary placeholder-muted-foreground resize-none"
                  required
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="internal"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="h-3.5 w-3.5 text-primary border-border focus:ring-primary rounded"
                    />
                    <Label htmlFor="internal" className="text-xs text-muted-foreground cursor-pointer select-none">
                      Mark as Internal Note (private)
                    </Label>
                  </div>
                  <Button type="submit" size="sm" disabled={isReplySubmitting} className="h-8 px-4 text-xs bg-primary text-white hover:opacity-90">
                    {isReplySubmitting ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" /> : null}
                    Post Response
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-20 shadow-sm flex flex-col items-center justify-center min-h-[480px] text-center gap-3">
              <MessageSquare className="h-10 w-10 text-muted-foreground/60" />
              <div>
                <h3 className="text-sm font-bold text-foreground">Select a Clarification</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">Select a technical clarification thread from the index list to view details, add attachments, or post replies.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">Raise Technical Clarification</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Create a new technical clarification ticket mapping to a tender.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="tender" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Tender ID *
              </Label>
              <Select value={tenderId} onValueChange={(val) => setTenderId(val || '')}>
                <SelectTrigger id="tender" className="w-full text-xs">
                  <SelectValue placeholder="Select Tender">
                    {selectedTenderLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {tenders.map(t => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.title} ({t.id.slice(0, 8)}...)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="question" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Clarification Query / Question *
              </Label>
              <textarea 
                id="question" 
                placeholder="Type details of your technical query or ambiguity in bid specification..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="w-full min-h-[80px] p-2.5 text-xs bg-card border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary placeholder-muted-foreground"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignee" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Assign to User
              </Label>
              <Select value={assignedToId} onValueChange={(val) => setAssignedToId(val || '')}>
                <SelectTrigger id="assignee" className="w-full text-xs">
                  <SelectValue placeholder="Select Assignee">
                    {selectedAssigneeLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dueDate" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Due Date
                </Label>
                <Input 
                  id="dueDate" 
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Priority
                </Label>
                <Select value={priority} onValueChange={(val) => setPriority(val || 'MEDIUM')}>
                  <SelectTrigger id="priority" className="w-full text-xs">
                    <SelectValue placeholder="Priority">
                      {selectedPriorityLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW" className="text-xs">Low</SelectItem>
                    <SelectItem value="MEDIUM" className="text-xs">Medium</SelectItem>
                    <SelectItem value="HIGH" className="text-xs">High</SelectItem>
                    <SelectItem value="CRITICAL" className="text-xs">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting} className="text-xs bg-primary text-white">
                Create Thread
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">Edit Clarification Status</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Modify the assignment, priority, or status of this ticket.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="editQuestion" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Query Question Text
              </Label>
              <textarea 
                id="editQuestion" 
                value={editQuestion}
                onChange={(e) => setEditQuestion(e.target.value)}
                className="w-full min-h-[70px] p-2.5 text-xs bg-card border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>             <div className="space-y-2">
              <Label htmlFor="editAssignee" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Reassign to User
              </Label>
              <Select value={editAssignedToId} onValueChange={(val) => setEditAssignedToId(val || '')}>
                <SelectTrigger id="editAssignee" className="w-full text-xs">
                  <SelectValue placeholder="Select Assignee">
                    {selectedEditAssigneeLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="editStatus" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Thread Status
              </Label>
              <Select value={editStatus} onValueChange={(val) => setEditStatus(val || 'OPEN')}>
                <SelectTrigger id="editStatus" className="w-full text-xs">
                  <SelectValue placeholder="Select Status">
                    {selectedEditStatusLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN" className="text-xs">Open</SelectItem>
                  <SelectItem value="ANSWERED" className="text-xs">Answered</SelectItem>
                  <SelectItem value="REVISED" className="text-xs">Revised</SelectItem>
                  <SelectItem value="CLOSED" className="text-xs">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editDueDate" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Due Date
                </Label>
                <Input 
                  id="editDueDate" 
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editPriority" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Priority
                </Label>
                <Select value={editPriority} onValueChange={(val) => setEditPriority(val || 'MEDIUM')}>
                  <SelectTrigger id="editPriority" className="w-full text-xs">
                    <SelectValue placeholder="Priority">
                      {selectedEditPriorityLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW" className="text-xs">Low</SelectItem>
                    <SelectItem value="MEDIUM" className="text-xs">Medium</SelectItem>
                    <SelectItem value="HIGH" className="text-xs">High</SelectItem>
                    <SelectItem value="CRITICAL" className="text-xs">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsEditOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting} className="text-xs bg-primary text-white">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Attach File Dialog */}
      <Dialog open={isAttachOpen} onOpenChange={setIsAttachOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">Attach Document</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Attach supporting documentation to this technical clarification thread.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAttachSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="fileName" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Document Name *
              </Label>
              <Input 
                id="fileName" 
                type="text" 
                placeholder="e.g. valve_datasheet_v2.pdf" 
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="text-xs"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fileUrl" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Document URL / Object Storage Path *
              </Label>
              <Input 
                id="fileUrl" 
                type="text" 
                placeholder="e.g. https://minio.dvepl.com/clarifications/file.pdf" 
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                className="text-xs"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAttachOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isAttachSubmitting} className="text-xs bg-primary text-white">
                Attach File
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TechnicalClarificationsPage;
