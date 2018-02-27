/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 * @format
 */

import type {IDebugService, IThread} from '../types';
import type {Row} from 'nuclide-commons-ui/Table';

import invariant from 'assert';
import * as React from 'react';
import ReactDOM from 'react-dom';
import {Icon} from 'nuclide-commons-ui/Icon';
import {Table} from 'nuclide-commons-ui/Table';
import UniversalDisposable from 'nuclide-commons/UniversalDisposable';
import {
  LoadingSpinner,
  LoadingSpinnerSizes,
} from 'nuclide-commons-ui/LoadingSpinner';
import debounce from 'nuclide-commons/debounce';
import {scrollIntoViewIfNeeded} from 'nuclide-commons-ui/scrollIntoView';

type Props = {|
  +service: IDebugService,
|};

type State = {
  threadList: Array<IThread>,
  selectedThreadId: number,
  // $FlowFixMe
  sortedColumn: ?ColumnName,
  sortDescending: boolean,
  threadsLoading: boolean,
};

type CellData = {|
  id: number,
  name: string,
  address: ?string,
  stopReason: ?string,
  isSelected: boolean,
|};

type ColumnName = 'id' | 'name' | 'address' | 'stopReason' | 'isSelected';

const activeThreadIndicatorComponent = (props: {cellData: boolean}) => (
  <div className="nuclide-debugger-thread-list-item-current-indicator">
    {props.cellData ? (
      <Icon icon="arrow-right" title="Selected Thread" />
    ) : null}
  </div>
);

export default class DebuggerThreadsComponent extends React.Component<
  Props,
  State,
> {
  _disposables: UniversalDisposable;
  _threadTable: ?Table<*>;

  constructor(props: Props) {
    super(props);
    (this: any)._handleThreadsChanged = debounce(
      this._handleThreadsChanged,
      150,
    );

    this._disposables = new UniversalDisposable();
    this.state = {
      sortedColumn: null,
      sortDescending: false,
      threadList: [],
      selectedThreadId: -1,
      threadsLoading: false,
      ...this._getState(),
    };
  }

  componentDidMount(): void {
    this._disposables.add(
      this.props.service
        .getModel()
        .onDidChangeCallStack(() => this._handleThreadsChanged()),
    );
  }

  componentWillUnmount(): void {
    this._disposables.dispose();
  }

  componentDidUpdate() {
    // Ensure the selected thread is scrolled into view.
    this._scrollSelectedThreadIntoView();
  }

  _scrollSelectedThreadIntoView(): void {
    const listNode = ReactDOM.findDOMNode(this._threadTable);
    if (listNode) {
      const selectedRows =
        // $FlowFixMe
        listNode.getElementsByClassName(
          'nuclide-debugger-thread-list-item-selected',
        );

      if (selectedRows && selectedRows.length > 0) {
        scrollIntoViewIfNeeded(selectedRows[0], false);
      }
    }
  }

  _handleThreadsChanged(): void {
    this.setState(this._getState());
  }

  _getState(): $Shape<State> {
    const {focusedThread, focusedProcess} = this.props.service.viewModel;
    return {
      threadList: focusedProcess == null ? [] : focusedProcess.getAllThreads(),
      selectedThreadId: focusedThread == null ? -1 : focusedThread.threadId,
      threadsLoading: false, // TODO
    };
  }

  _handleSelectThread = async (data: CellData): Promise<void> => {
    const {service} = this.props;
    const matchedThread = this.state.threadList.filter(
      t => t.threadId === data.id,
    );

    invariant(matchedThread.length === 1);
    const thread: IThread = matchedThread[0];
    await service.getModel().fetchCallStack((thread: any));
    this.props.service.focusStackFrame(null, thread, null, true);
  };

  _handleSort = (sortedColumn: ?ColumnName, sortDescending: boolean): void => {
    this.setState({sortedColumn, sortDescending});
  };

  _sortRows = (
    threads: Array<Row<CellData>>,
    sortedColumnName: ?ColumnName,
    sortDescending: boolean,
  ): Array<Row<CellData>> => {
    if (sortedColumnName == null) {
      return threads;
    }

    // Use a numerical comparison for the ID column, string compare for all the others.
    const compare: any =
      sortedColumnName.toLowerCase() === 'id'
        ? (a: ?number, b: ?number, isAsc: boolean): number => {
            const cmp = (a || 0) - (b || 0);
            return isAsc ? cmp : -cmp;
          }
        : (a: string, b: string, isAsc: boolean): number => {
            const cmp = a.toLowerCase().localeCompare(b.toLowerCase());
            return isAsc ? cmp : -cmp;
          };

    const getter = row => row.data[sortedColumnName];
    return [...threads].sort((a, b) => {
      return compare(getter(a), getter(b), !sortDescending);
    });
  };

  render(): React.Node {
    const {threadList, selectedThreadId} = this.state;
    const activeThreadCol = {
      component: activeThreadIndicatorComponent,
      title: '',
      key: 'isSelected',
      width: 0.05,
    };

    const columns = [
      activeThreadCol,
      {
        title: 'ID',
        key: 'id',
        width: 0.1,
      },
      {
        title: 'Name',
        key: 'name',
        width: 0.15,
      },
      {
        title: 'Address',
        key: 'address',
        width: 0.45,
      },
      {
        title: 'Stop Reason',
        key: 'stopReason',
        width: 0.25,
      },
    ];

    const emptyComponent = () => (
      <div className="nuclide-debugger-thread-list-empty">
        {threadList == null ? '(threads unavailable)' : 'no threads to display'}
      </div>
    );
    const rows =
      threadList == null
        ? []
        : threadList.map(thread => {
            const stoppedDetails = thread.stoppedDetails;
            const callstack = thread.getCallStack();
            const cellData = {
              data: {
                id: thread.threadId,
                name: thread.name,
                address: callstack.length === 0 ? null : callstack[0].name,
                stopReason:
                  stoppedDetails == null
                    ? null
                    : stoppedDetails.description != null
                      ? stoppedDetails.description
                      : stoppedDetails.reason,
                isSelected: thread.threadId === selectedThreadId,
              },
            };
            if (thread.threadId === selectedThreadId) {
              // $FlowIssue className is an optional property of a table row
              cellData.className = 'nuclide-debugger-thread-list-item-selected';
            }
            return cellData;
          });

    if (this.state.threadsLoading) {
      return (
        <div
          className="nuclide-debugger-thread-loading"
          title="Loading threads...">
          <LoadingSpinner size={LoadingSpinnerSizes.MEDIUM} />
        </div>
      );
    }

    return (
      <Table
        columns={columns}
        emptyComponent={emptyComponent}
        rows={this._sortRows(
          rows,
          this.state.sortedColumn,
          this.state.sortDescending,
        )}
        selectable={true}
        resizable={true}
        onSelect={this._handleSelectThread}
        sortable={true}
        onSort={this._handleSort}
        sortedColumn={this.state.sortedColumn}
        sortDescending={this.state.sortDescending}
        ref={table => {
          this._threadTable = table;
        }}
      />
    );
  }
}
