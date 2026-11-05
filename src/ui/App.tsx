import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionIcon, AppShell, Badge, Box, Button, Card, Container, Group, Loader, Modal, MultiSelect, NativeSelect, Paper, ScrollArea, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { DndContext, PointerSensor, TouchSensor, useDroppable, useDraggable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { normalizeTags, isValidTitle } from './validation';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';
import { api, parseTags, statuses, statusNames, priorityNames, priorityOptions, type Idea, type Priority, type Status } from './types';

const priorityColor:Record<Priority,string>={low:'gray',medium:'blue',high:'red'};
const ideaPlural = new Intl.PluralRules('ru');
const ideaCount = (count:number) => `${count} ${{one:'сохранённая идея',few:'сохранённые идеи',many:'сохранённых идей',other:'сохранённых идей'}[ideaPlural.select(count) as 'one'|'few'|'many'|'other']}`;
const initial={title:'',description:'',status:'inbox' as Status,priority:'medium' as Priority,tags:[] as string[]};
function IdeaCard({idea,onEdit}:{idea:Idea;onEdit:(idea:Idea)=>void}) {
  const drag=useDraggable({id:idea.id});
  return <Card withBorder radius="md" padding="sm" ref={drag.setNodeRef} style={{transform:CSS.Translate.toString(drag.transform),opacity:drag.isDragging?0.5:1,touchAction:'pan-y'}}>
    <Group justify="space-between" align="start" wrap="nowrap"><Text fw={600} size="sm" style={{overflowWrap:'anywhere'}}>{idea.title}</Text><ActionIcon variant="subtle" color="gray" aria-label={'Редактировать: '+idea.title} onClick={()=>onEdit(idea)}>✎</ActionIcon></Group>
    {idea.description && <Text size="xs" c="dimmed" lineClamp={3} mt="xs">{idea.description}</Text>}
    <Group mt="sm" gap={4}><Badge color={priorityColor[idea.priority]} size="xs">{priorityNames[idea.priority]}</Badge>{parseTags(idea.tags).map(t=><Badge key={t} variant="light" color="gray" size="xs">{t}</Badge>)}</Group>
    <Box mt="sm" {...drag.listeners} {...drag.attributes} tabIndex={0} role="button" aria-label={'Переместить: '+idea.title} style={{cursor:'grab',borderTop:'1px solid var(--mantine-color-default-border)',paddingTop:6}}><Text size="xs" c="dimmed" ta="center">⠿ Перетащите для перемещения</Text></Box>
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
 const [newTag,setNewTag]=useState('');
 const [opened,{open,close}]=useDisclosure(false),[editing,setEditing]=useState<string|null>(null),[form,setForm]=useState({...initial});
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}),useSensor(TouchSensor,{activationConstraint:{delay:250,tolerance:8}}));
 const load=useCallback(async()=>{try{setIdeas(await api<Idea[]>('/api/ideas'));}catch(e){notifications.show({color:'red',title:'Не удалось загрузить идеи',message:String(e)});}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);
 const tags=useMemo(()=>Array.from(new Set(ideas.flatMap(i=>parseTags(i.tags)))).sort(),[ideas]);
 const visible=useMemo(()=>ideas.filter(i=>(!query || (i.title+' '+i.description).toLowerCase().includes(query.toLowerCase()))&&(!priorityFilter||i.priority===priorityFilter)&&(!tagFilter.length||tagFilter.every(t=>parseTags(i.tags).includes(t)))),[ideas,query,priorityFilter,tagFilter]);
 const edit=(idea?:Idea)=>{setEditing(idea?.id??null);setForm(idea?{title:idea.title,description:idea.description,status:idea.status,priority:idea.priority,tags:parseTags(idea.tags)}:{...initial,tags:[]});setNewTag('');open()};
 const save=async()=>{if(!isValidTitle(form.title))return;setSaving(true);try{const payload=JSON.stringify({...form,title:form.title.trim(),tags:normalizeTags(form.tags)});await api(editing?'/api/ideas/'+editing:'/api/ideas',{method:editing?'PATCH':'POST',body:payload});close();await load();notifications.show({message:editing?'Идея обновлена':'Идея создана',color:'green'});}catch(e){notifications.show({color:'red',message:String(e)})}finally{setSaving(false)}};
 const remove=async()=>{if(!editing||!window.confirm('Удалить эту идею навсегда?'))return;setSaving(true);try{await api('/api/ideas/'+editing,{method:'DELETE'});close();await load();}catch(e){notifications.show({color:'red',message:String(e)})}finally{setSaving(false)}};
 const move=async(e:DragEndEvent)=>{const idea=ideas.find(i=>i.id===e.active.id);const target=e.over?.id as Status|undefined;if(!idea||!target||!statuses.includes(target)||idea.status===target)return;setIdeas(old=>old.map(i=>i.id===idea.id?{...i,status:target}:i));try{await api('/api/ideas/'+idea.id,{method:'PATCH',body:JSON.stringify({status:target})});}catch(err){notifications.show({color:'red',message:String(err)});await load()}};
 return <AppShell header={{height:68}} padding="md"><AppShell.Header><Container size="xl" h="100%"><Group h="100%" justify="space-between"><Title order={3}>Хранилище идей</Title><Button onClick={()=>edit()}>+ Новая идея</Button></Group></Container></AppShell.Header><AppShell.Main><Container size="xl">
 <Stack gap="lg"><PwaUpdatePrompt blocked={opened || saving} /><Group justify="space-between" align="end"><Box><Title order={2}>Ваши идеи</Title><Text c="dimmed" size="sm">{ideaCount(ideas.length)}</Text></Box><SegmentedControl value={view} onChange={setView} data={[{label:'Доска',value:'board'},{label:'Список',value:'list'}]}/></Group>
 <Group align="end"><TextInput label="Поиск" placeholder="Поиск идей…" value={query} onChange={e=>setQuery(e.currentTarget.value)} style={{flex:'2 1 200px'}}/><Select label="Приоритет" placeholder="Все приоритеты" clearable clearButtonProps={{'aria-label':'Сбросить приоритет'}} value={priorityFilter} onChange={setPriorityFilter} data={priorityOptions} style={{flex:'1 1 130px'}}/><MultiSelect label="Теги" placeholder="Все теги" data={tags} value={tagFilter} onChange={setTagFilter} searchable clearable clearButtonProps={{'aria-label':'Очистить теги'}} style={{flex:'1 1 160px'}}/></Group>
 {loading?<Group justify="center" py="xl"><Loader/></Group>:<DndContext sensors={sensors} onDragEnd={e=>void move(e)}>{view==='board'?<ScrollArea type="auto"><Group align="stretch" wrap="nowrap" gap="sm" pb="md">{statuses.map(s=><Column key={s} status={s} ideas={visible.filter(i=>i.status===s)} onEdit={edit}/>)}</Group></ScrollArea>:<SimpleGrid cols={{base:1,sm:2,lg:3}}>{visible.map(i=><IdeaCard key={i.id} idea={i} onEdit={edit}/>)}</SimpleGrid>}</DndContext>}
 {!loading&&visible.length===0&&<Text c="dimmed" ta="center" py="xl">Идеи не найдены</Text>}
 </Stack></Container></AppShell.Main>
 <Modal closeButtonProps={{'aria-label':'Закрыть'}} opened={opened} onClose={close} title={editing?'Редактирование идеи':'Новая идея'} centered size="lg"><Stack><TextInput label="Название" required maxLength={200} value={form.title} onChange={e=>setForm(f=>({...f,title:e.currentTarget.value}))}/><Textarea label="Описание" minRows={4} maxLength={10000} autosize value={form.description} onChange={e=>setForm(f=>({...f,description:e.currentTarget.value}))}/><Group grow><NativeSelect label="Статус" value={form.status} onChange={e=>setForm(f=>({...f,status:e.currentTarget.value as Status}))} data={statuses.map(s=>({value:s,label:statusNames[s]}))}/><NativeSelect label="Приоритет" value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.currentTarget.value as Priority}))} data={priorityOptions}/></Group><MultiSelect label="Теги" data={Array.from(new Set([...tags,...form.tags]))} value={form.tags} onChange={tags=>setForm(f=>({...f,tags}))} searchable clearable clearButtonProps={{'aria-label':'Очистить теги'}} /><Group><TextInput label="Новый тег" placeholder="Название тега" value={newTag} maxLength={40} onChange={e=>setNewTag(e.currentTarget.value)} style={{flex:1}}/><Button variant="light" disabled={!newTag.trim()||form.tags.length>=20} onClick={()=>{setForm(f=>({...f,tags:normalizeTags([...f.tags,newTag])}));setNewTag('')}}>Добавить тег</Button></Group><Group justify="space-between">{editing?<Button color="red" variant="light" onClick={()=>void remove()} loading={saving}>Удалить</Button>:<Box/>}<Group><Button variant="default" onClick={close}>Отмена</Button><Button loading={saving} disabled={!form.title.trim()} onClick={()=>void save()}>Сохранить</Button></Group></Group></Stack></Modal>
 </AppShell>;
}
