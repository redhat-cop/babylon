import React from 'react';
import { $createParagraphNode, $createTextNode, $getRoot, EditorState, LexicalEditor } from 'lexical';
import { InitialEditorStateType, LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { ListItemNode, ListNode } from '@lexical/list';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import ToolbarPlugin from './ToolbarPlugin';
import Theme from './Theme';
import AutoLinkPlugin from './AutoLinkPlugin';

import './editor.css';

const Editor: React.FC<{
  onChange: (editorState: EditorState, editor: LexicalEditor) => void;
  placeholder: string;
  defaultValue?: string;
}> = ({ onChange, placeholder, defaultValue }) => {
  let _defaultValue: InitialEditorStateType = defaultValue;
  try {
    JSON.parse(defaultValue);
  } catch {
    _defaultValue = () => {
      const root = $getRoot();
      root.clear();
      const p = $createParagraphNode();
      p.append($createTextNode(defaultValue));
      root.append(p);
    };
  }
  return (
    <div className="editor">
      <LexicalComposer
        initialConfig={{
          namespace: 'editor',
          editorState: _defaultValue,
          theme: Theme,
          nodes: [
            HeadingNode,
            ListNode,
            ListItemNode,
            QuoteNode,
            CodeNode,
            CodeHighlightNode,
            TableNode,
            TableCellNode,
            TableRowNode,
            AutoLinkNode,
            LinkNode,
          ],
          onError(error) {
            throw error;
          },
        }}
      >
        <div className="editor__container">
          <ToolbarPlugin />
          <div className="editor__inner">
            <RichTextPlugin
              contentEditable={<ContentEditable className="editor__input" />}
              placeholder={<div className="editor__placeholder">{placeholder}</div>}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <OnChangePlugin onChange={onChange} />
            <HistoryPlugin />
            <ListPlugin />
            <LinkPlugin />
            <AutoLinkPlugin />
            <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          </div>
        </div>
      </LexicalComposer>
    </div>
  );
};

export default Editor;
