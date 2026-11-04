import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionIcon, AppShell, Badge, Box, Button, Card, Container, Group, Loader, Modal, MultiSelect, NativeSelect, Paper, ScrollArea, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { DndContext, PointerSensor, TouchSensor, useDroppable, useDraggable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { api, parseTags, statuses, statusNames, type Idea, type Priority, type Status } from './types';

const priorityColor:Record<Priority,string>={low:'gray',medium:'blue',high:'red'};
const initial={title:'',description:'',status:'inbox' as Status,priority:'medium' as Priority,tags:[] as string[]};
function IdeaCard({idea,onEdit}:{idea:Idea;onEdit:(idea:Idea)=>void}) {
  const drag=useDraggable({id:idea.id});
  return <Card withBorder radius="md" padding="sm" ref={drag.setNodeRef} style={{transform:CSS.Translate.toString(drag.transform),opacity:drag.isDragging?0.5:1,touchAction:'pan-y'}}>
    <Group justify="space-between" align="start" wrap="nowrap"><Text fw={600} size="sm" style={{overflowWrap:'anywhere'}}>{idea.title}</Text><ActionIcon variant="subtle" color="gray" aria-label={'Edit '+idea.title} onClick={()=>onEdit(idea)}>✎</ActionIcon></Group>
    {idea.description && <Text size="xs" c="dimmed" lineClamp={3} mt="xs">{idea.description}</Text>}
    <Group mt="sm" gap={4}><Badge color={priorityColor[idea.priority]} size="xs">{idea.priority}</Badge>{parseTags(idea.tags).map(t=><Badge key={t} variant="light" color="gray" size="xs">{t}</Badge>)}</Group>
    <Box mt="sm" {...drag.listeners} {...drag.attributes} tabIndex={0} role="button" aria-label={'Drag '+idea.title} style={{cursor:'grab',borderTop:'1px solid var(--mantine-color-default-border)',paddingTop:6}}><Text size="xs" c="dimmed" ta="center">⠿ Drag to move</Text></Box>
  </Card>;
}
function Column({status,ideas,onEdit}:{status:Status;ideas:Idea[];onEdit:(idea:Idea)=>void}){
 const drop=useDroppable({id:status});
 return <Paper ref={drop.setNodeRef} p="sm" radius="md" bg={drop.isOver?'var(--mantine-color-blue-light)':'var(--mantine-color-default-hover)'} style={{minWidth:245,flex:'1 0 245px',alignSelf:'stretch'}}>
   <Group justify="space-between" mb="sm"><Text fw={700} size="sm">{statusNames[status]}</Text><Badge variant="light" color="gray">{ideas.length}</Badge></Group>
   <Stack gap="xs">{ideas.map(idea=><IdeaCard key={idea.id} idea={idea} onEdit={onEdit}/>)}</Stack>
 </Paper>;
}
export function App(){
 const [ideas,setIdeas]=useState<Idea[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [query,setQuery]=useState(''),[priorityFilter,setPriorityFilter]=useState<string|null>(null),[tagFilter,setTagFilter]=useState<string[]>([]),[view,setView]=useState('board');
 const [opened,{open,close}]=useDisclosure(false),[editing,setEditing]=useState<string|null>(null),[form,setForm]=useState({...initial});
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}),useSensor(TouchSensor,{activationConstraint:{delay:250,tolerance:8}}));
 const load=useCallback(async()=>{try{setIdeas(await api<Idea[]>('/api/ideas'));}catch(e){notifications.show({color:'red',title:'Unable to load ideas',message:String(e)});}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);
 const tags=useMemo(()=>Array.from(new Set(ideas.flatMap(i=>parseTags(i.tags)))).sort(),[ideas]);
 const visible=useMemo(()=>ideas.filter(i=>(!query || (i.title+' '+i.description).toLowerCase().includes(query.toLowerCase()))&&(!priorityFilter||i.priority===priorityFilter)&&(!tagFilter.length||tagFilter.every(t=>parseTags(i.tags).includes(t)))),[ideas,query,priorityFilter,tagFilter]);
 const edit=(idea?:Idea)=>{setEditing(idea?.id??null);setForm(idea?{title:idea.title,description:idea.description,status:idea.status,priority:idea.priority,tags:parseTags(idea.tags)}:{...initial,tags:[]});open()};
 const save=async()=>{if(!form.title.trim())return;setSaving(true);try{const payload=JSON.stringify({...form,title:form.title.trim()});await api(editing?'/api/ideas/'+editing:'/api/ideas',{method:editing?'PATCH':'POST',body:payload});close();await load();notifications.show({message:editing?'Idea updated':'Idea created',color:'green'});}catch(e){notifications.show({color:'red',message:String(e)})}finally{setSaving(false)}};
 const remove=async()=>{if(!editing||!window.confirm('Delete this idea permanently?'))return;setSaving(true);try{await api('/api/ideas/'+editing,{method:'DELETE'});close();await load();}catch(e){notifications.show({color:'red',message:String(e)})}finally{setSaving(false)}};
 const move=async(e:DragEndEvent)=>{const idea=ideas.find(i=>i.id===e.active.id);const target=e.over?.id as Status|undefined;if(!idea||!target||!statuses.includes(target)||idea.status===target)return;setIdeas(old=>old.map(i=>i.id===idea.id?{...i,status:target}:i));try{await api('/api/ideas/'+idea.id,{method:'PATCH',body:JSON.stringify({status:target})});}catch(err){notifications.show({color:'red',message:String(err)});await load()}};
 return <AppShell header={{height:68}} padding="md"><AppShell.Header><Container size="xl" h="100%"><Group h="100%" justify="space-between"><Title order={3}>Idea Vault</Title><Button onClick={()=>edit()}>+ New idea</Button></Group></Container></AppShell.Header><AppShell.Main><Container size="xl">
 <Stack gap="lg"><Group justify="space-between" align="end"><Box><Title order={2}>Your ideas</Title><Text c="dimmed" size="sm">{ideas.length} saved ideas</Text></Box><SegmentedControl value={view} onChange={setView} data={[{label:'Board',value:'board'},{label:'List',value:'list'}]}/></Group>
 <Group align="end"><TextInput label="Search" placeholder="Search ideas…" value={query} onChange={e=>setQuery(e.currentTarget.value)} style={{flex:'2 1 200px'}}/><Select label="Priority" placeholder="All priorities" clearable value={priorityFilter} onChange={setPriorityFilter} data={['low','medium','high']} style={{flex:'1 1 130px'}}/><MultiSelect label="Tags" placeholder="All tags" data={tags} value={tagFilter} onChange={setTagFilter} searchable clearable style={{flex:'1 1 160px'}}/></Group>
 {loading?<Group justify="center" py="xl"><Loader/></Group>:<DndContext sensors={sensors} onDragEnd={e=>void move(e)}>{view==='board'?<ScrollArea type="auto"><Group align="stretch" wrap="nowrap" gap="sm" pb="md">{statuses.map(s=><Column key={s} status={s} ideas={visible.filter(i=>i.status===s)} onEdit={edit}/>)}</Group></ScrollArea>:<SimpleGrid cols={{base:1,sm:2,lg:3}}>{visible.map(i=><IdeaCard key={i.id} idea={i} onEdit={edit}/>)}</SimpleGrid>}</DndContext>}
 {!loading&&visible.length===0&&<Text c="dimmed" ta="center" py="xl">No matching ideas</Text>}
 </Stack></Container></AppShell.Main>
 <Modal opened={opened} onClose={close} title={editing?'Edit idea':'New idea'} centered size="lg"><Stack><TextInput label="Title" required maxLength={200} value={form.title} onChange={e=>setForm(f=>({...f,title:e.currentTarget.value}))}/><Textarea label="Description" minRows={4} maxLength={10000} autosize value={form.description} onChange={e=>setForm(f=>({...f,description:e.currentTarget.value}))}/><Group grow><NativeSelect label="Status" value={form.status} onChange={e=>setForm(f=>({...f,status:e.currentTarget.value as Status}))} data={statuses.map(s=>({value:s,label:statusNames[s]}))}/><NativeSelect label="Priority" value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.currentTarget.value as Priority}))} data={['low','medium','high']}/></Group><MultiSelect label="Tags" data={Array.from(new Set([...tags,...form.tags]))} value={form.tags} onChange={tags=>setForm(f=>({...f,tags}))} searchable clearable description="Select existing tags; create new tags in a future update"/><Group justify="space-between">{editing?<Button color="red" variant="light" onClick={()=>void remove()} loading={saving}>Delete</Button>:<Box/>}<Group><Button variant="default" onClick={close}>Cancel</Button><Button loading={saving} disabled={!form.title.trim()} onClick={()=>void save()}>Save</Button></Group></Group></Stack></Modal>
 </AppShell>;
}
