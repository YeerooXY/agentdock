import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { lineNumbers } from '@codemirror/view';
import { LanguageDescription, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { languages } from '@codemirror/language-data';
import { unifiedMergeView } from '@codemirror/merge';

export async function codeEditor(parent, file, diff, onSelection) {
  const language = LanguageDescription.matchFilename(languages, file.file);
  const extensions = [basicSetup, EditorState.readOnly.of(true), EditorView.editable.of(false),
    lineNumbers({ domEventHandlers: { mousedown(view, block, event) {
      const line = view.state.doc.lineAt(block.from), selected = view.state.selection.main;
      view.dispatch({ selection: { anchor: event.shiftKey && !selected.empty ? selected.anchor : line.from, head: line.to } });
      view.focus(); event.preventDefault(); return true;
    } } }),
    EditorView.contentAttributes.of({ tabindex: '0', 'aria-label': 'Read-only code', 'aria-readonly': 'true' }),
    EditorView.theme({
      '&': { height: '100%', backgroundColor: '#0b0d16', color: '#e0e4f3', fontSize: '14px' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'Cascadia Code, Consolas, monospace' },
      '.cm-content': { caretColor: '#e0e4f3' }, '.cm-gutters': { backgroundColor: '#101421', color: '#a0abc9', border: 'none' },
      '.cm-activeLine,.cm-activeLineGutter': { backgroundColor: '#192336' },
      '&.cm-focused .cm-selectionBackground,.cm-selectionBackground,::selection': { backgroundColor: '#334c79 !important' },
      '.cm-insertedLine': { backgroundColor: '#163327' }, '.cm-deletedChunk': { backgroundColor: '#391c28' },
      '.cm-insertedText': { backgroundColor: '#246341' }, '.cm-deletedText': { backgroundColor: '#6b2e43' },
      '.cm-searchMatch': { backgroundColor: '#67562a' }, '.cm-panels': { backgroundColor: '#161b2a', color: '#e0e4f3' },
    }, { dark: true }), syntaxHighlighting(HighlightStyle.define([
      { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: '#d4baff' },
      { tag: [tags.string, tags.regexp], color: '#b9e8c8' },
      { tag: [tags.number, tags.bool, tags.null], color: '#ffd2a6' },
      { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#a5d4ff' },
      { tag: [tags.typeName, tags.className, tags.tagName], color: '#a2e3e2' },
      { tag: tags.comment, color: '#aab5cf', fontStyle: 'italic' },
      { tag: [tags.variableName, tags.propertyName, tags.operator, tags.punctuation], color: '#e0e4f3' },
    ])), EditorView.updateListener.of(update => { if (update.selectionSet) onSelection(); })];
  if (language) { try { extensions.push(await language.load()); } catch { /* Plain text remains readable offline. */ } }
  if (diff && file.before != null && file.after != null) extensions.push(unifiedMergeView({ original: file.before, mergeControls: false, highlightChanges: true, syntaxHighlightDeletions: true, diffConfig: { scanLimit: 500, timeout: 1500 } }));
  return new EditorView({ parent, state: EditorState.create({ doc: file.after ?? file.before ?? '', extensions }) });
}
